// FIX: this used to guess the deployment base path by searching
// window.location.pathname for '/gui/' or '/dashboards/'. That breaks when
// the page is loaded in a context where neither substring appears in the
// URL (e.g. embedded inside NOMAD GUI v2), silently sending every API call
// to the wrong, unprefixed URL (404). The backend now injects the real
// base path as window.NOMAD_API_BASE (see processing/app.py); prefer that,
// and only fall back to the old URL-guessing if it is ever missing.
function nomadApiBase() {
    if (window.NOMAD_API_BASE) {
        return window.NOMAD_API_BASE;
    }
    const pathname = window.location.pathname;
    const markers = ['/gui/', '/dashboards/'];
    for (const marker of markers) {
        const index = pathname.indexOf(marker);
        if (index >= 0) return pathname.slice(0, index) + '/api/v1';
    }
    return '/api/v1';
}

let recipeSchemas = {};


async function loadProcessTypes() {
    const response = await fetch('./process-types');
    if (!response.ok) {
        throw new Error(
            'Could not load process types: ' + response.status
        );
    }

    const result = await response.json();

    if (
        !result ||
        typeof result !== 'object' ||
        !Object.keys(result).length
    ) {
        throw new Error('No process types configured.');
    }

    return result;
}

let substrates = [];
let recipes = [];
let processCounter = 0;

function nomadArchiveReference(uploadId, entryId) {
    return '../uploads/' + uploadId + '/archive/' + entryId + '#/data';
}

// FIX: /entries/query (the plain search endpoint) only accepts pre-indexed
// "doc quantities" in required.include (entry_id, upload_id, results.*, ...).
// It cannot return archive content like data.lab_id -- NOMAD rejects that
// with 422 "data.lab_id is not a doc quantity". Archive content (anything
// under "data") has to come from /entries/archive/query instead, which
// takes a nested required shape: {metadata: {...}, data: {...}}.
//
// Still accepts the same flat 'include' list callers already pass (e.g.
// ['entry_id', 'upload_id', 'entry_name', 'data.lab_id']) and splits it
// internally, so no call site needs to change. Returned objects keep the
// same shape callers already expect (entry.data.x, entry.entry_name, ...).
async function queryEntries(schema, pageSize, include) {
    const fields = include || ['entry_id', 'upload_id', 'entry_name'];
    const metadataRequired = {};
    const dataRequired = {};
    let wantsFullData = false;

    for (const field of fields) {
        if (field === 'entry_id' || field === 'upload_id') {
            continue;
        }
        if (field === 'data') {
            wantsFullData = true;
        } else if (field.startsWith('data.')) {
            dataRequired[field.slice('data.'.length)] = '*';
        } else {
            metadataRequired[field] = '*';
        }
    }

    const required = {};
    if (Object.keys(metadataRequired).length) {
        required.metadata = metadataRequired;
    }
    if (wantsFullData) {
        required.data = '*';
    } else if (Object.keys(dataRequired).length) {
        required.data = dataRequired;
    }

    const response = await fetch(nomadApiBase() + '/entries/archive/query', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            // FIX: without an explicit owner NOMAD defaults to owner="public",
            // which only returns PUBLISHED entries. Lab data lives in unpublished
            // uploads, so every query came back empty. "visible" = public + everything
            // the logged-in user can see (login is sent automatically via cookie).
            owner: 'visible',
            query: {'section_defs.definition_qualified_name': schema},
            pagination: {page_size: pageSize},
            required: required
        })
    });
    if (!response.ok) throw new Error('NOMAD query failed for ' + schema + ': ' + response.status);
    const result = await response.json();
    return (result.data || []).map(function(entry) {
        const archive = entry.archive || {};
        return Object.assign(
            {
                entry_id: entry.entry_id,
                upload_id: entry.upload_id,
                data: archive.data || {}
            },
            archive.metadata || {}
        );
    });
}

function substrateStatus(substrate) {
    if (substrate.grown) return 'grown';
    if (substrate.processed) return 'processed';
    if (substrate.asDelivered) return 'as_delivered';
    return '';
}

async function loadSubstrates() {
    const entries = await queryEntries('pdi_nomad_plugin.mbe.materials.SubstrateMbe', 1000, [
        'entry_id', 'upload_id', 'entry_name', 'data.lab_id', 'data.material_designation',
        'data.chemical_formula', 'data.crystal_id', 'data.charge_id', 'data.surface_orientation_label',
        'data.as_delivered', 'data.processed', 'data.grown'
    ]);
    return entries.map(function(entry) {
        const data = entry.data || {};
        return {
            entryId: entry.entry_id,
            uploadId: entry.upload_id,
            labId: data.lab_id || entry.entry_name || entry.entry_id,
            material: data.material_designation || data.chemical_formula || '',
            formula: data.chemical_formula || '',
            crystalId: data.crystal_id || '',
            chargeId: data.charge_id || '',
            orientation: data.surface_orientation_label || '',
            asDelivered: Boolean(data.as_delivered),
            processed: Boolean(data.processed),
            grown: Boolean(data.grown),
            selected: false
        };
    });
}

async function loadRecipes() {
    const result = [];
    for (const [type, definition] of Object.entries(recipeSchemas)) {
        const entries = await queryEntries(definition.schema, 200, ['entry_id', 'upload_id', 'entry_name', 'data.name', 'data.lab_id']);
        entries.forEach(function(entry) {
            const data = entry.data || {};
            result.push({
                type: type,
                entryId: entry.entry_id,
                uploadId: entry.upload_id,
                name: data.lab_id || data.name || entry.entry_name || entry.entry_id
            });
        });
    }
    return result;
}

async function loadUploads() {
    const select = document.getElementById('targetUpload');
    const status = document.getElementById('uploadStatus');
    const params = new URLSearchParams();

    params.append('is_published', 'false');
    params.append('is_processing', 'false');
    params.append('page_size', '100');

    try {
        const [userResponse, uploadsResponse] = await Promise.all([
            fetch(nomadApiBase() + '/users/me'),
            fetch(
                nomadApiBase() +
                '/uploads?' +
                params.toString()
            )
        ]);

        if (!userResponse.ok) {
            throw new Error(
                'User request failed: ' +
                userResponse.status
            );
        }

        if (!uploadsResponse.ok) {
            throw new Error(
                'Upload request failed: ' +
                uploadsResponse.status
            );
        }

        const user = await userResponse.json();
        const result = await uploadsResponse.json();
        const userId = user.user_id;

        if (!userId) {
            throw new Error(
                'Authenticated NOMAD user has no user_id.'
            );
        }

        const uploads = (result.data || []).filter(
            function(upload) {
                const writers = Array.isArray(upload.writers)
                    ? upload.writers
                    : [];

                return (
                    upload.main_author === userId ||
                    writers.includes(userId)
                );
            }
        );

        select.innerHTML =
            '<option value="">Select target upload...</option>';

        uploads.forEach(function(upload) {
            const option =
                document.createElement('option');

            option.value = upload.upload_id;
            option.textContent =
                (upload.upload_name || 'Unnamed upload') +
                ' ? ' +
                upload.upload_id;

            select.appendChild(option);
        });

        status.textContent =
            uploads.length +
            ' directly writable unpublished upload(s).';

    } catch (error) {
        select.innerHTML =
            '<option value="">Could not load uploads</option>';

        status.textContent =
            'Error: ' + error.message;
    }
}

function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort(function(a, b) { return a.localeCompare(b); });
}

function populateFilter(id, values) {
    const select = document.getElementById(id);
    const previous = select.value;
    select.innerHTML = '<option value="">All</option>';
    uniqueSorted(values).forEach(function(value) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
    if (Array.from(select.options).some(function(option) { return option.value === previous; })) select.value = previous;
}

function filteredSubstrates() {
    const search = document.getElementById('substrateSearch').value.trim().toLowerCase();
    const material = document.getElementById('materialFilter').value;
    const batch = document.getElementById('batchFilter').value;
    const orientation = document.getElementById('orientationFilter').value;
    const status = document.getElementById('statusFilter').value;
    return substrates.filter(function(substrate) {
        const searchable = [substrate.labId, substrate.material, substrate.formula, substrate.crystalId, substrate.chargeId, substrate.orientation]
            .filter(Boolean).join(' ').toLowerCase();
        return (!search || searchable.includes(search)) &&
            (!material || substrate.material === material) &&
            (!batch || substrate.crystalId === batch || substrate.chargeId === batch) &&
            (!orientation || substrate.orientation === orientation) &&
            (!status || substrateStatus(substrate) === status);
    });
}

function renderSubstrates() {
    const container = document.getElementById('substrateResults');
    const visible = filteredSubstrates();
    container.innerHTML = '';
    visible.forEach(function(substrate) {
        const row = document.createElement('div');
        row.className = 'result-grid result-row';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = substrate.selected;
        checkbox.addEventListener('change', function() { substrate.selected = checkbox.checked; updateSaveSummary(); });
        row.appendChild(checkbox);
        [
            substrate.labId,
            substrate.material || '-',
            substrate.crystalId || substrate.chargeId || '-',
            substrate.orientation || '-',
            substrateStatus(substrate) || '-'
        ].forEach(function(value) {
            const cell = document.createElement('div');
            cell.textContent = value;
            row.appendChild(cell);
        });
        container.appendChild(row);
    });
    document.getElementById('substrateStatus').textContent =
        visible.length + ' matching substrate' + (visible.length === 1 ? '' : 's') +
        '; ' + substrates.filter(function(item) { return item.selected; }).length + ' selected.';
}

function updateRecipeSelect(card) {
    const type = card.querySelector('.process-type').value;
    const select = card.querySelector('.recipe-select');
    const matching = recipes.filter(function(recipe) { return recipe.type === type; });
    select.innerHTML = '<option value="">' + (matching.length ? 'Select recipe...' : 'No recipes found') + '</option>';
    matching.forEach(function(recipe) {
        const option = document.createElement('option');
        option.value = recipe.entryId;
        option.dataset.uploadId = recipe.uploadId;
        option.textContent = recipe.name;
        select.appendChild(option);
    });
    select.disabled = matching.length === 0;
}

function collapseOthers(active) {
    document.querySelectorAll('.process-card').forEach(function(card) {
        if (card !== active) card.classList.remove('open');
    });
}

function renumberProcesses() {
    document.querySelectorAll('.process-card').forEach(function(card, index) {
        card.querySelector('.process-title').textContent = 'Process ' + (index + 1);
    });
    processCounter = document.querySelectorAll('.process-card').length;
    updateSaveSummary();
}

function localDateTimeValue() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function addProcess() {
    processCounter += 1;
    const card = document.createElement('div');
    card.className = 'process-card open';
    collapseOthers(card);
    const options = Object.entries(recipeSchemas).map(function(entry) {
        return '<option value="' + entry[0] + '">' + entry[1].label + '</option>';
    }).join('');
    card.innerHTML = `
        <div class="process-summary"><div><div class="process-title">Process ${processCounter}</div><div class="process-meta">Cleaning</div></div><div>⌄</div></div>
        <div class="process-body">
            <div class="process-fields">
                <div><label>Process type</label><select class="process-type">${options}</select></div>
                <div><label>Date / Time</label><input class="process-datetime" type="datetime-local" value="${localDateTimeValue()}"></div>
            </div>
            <label>Recipe</label><select class="recipe-select"></select>
            <label>Comments</label><textarea class="process-comments" placeholder="Optional"></textarea>
            <div class="process-footer"><button class="remove-button" type="button">Remove process</button><button class="collapse-button" type="button">Done / collapse</button></div>
        </div>`;
    document.getElementById('processList').appendChild(card);
    const typeSelect = card.querySelector('.process-type');
    const meta = card.querySelector('.process-meta');
    card.querySelector('.process-summary').addEventListener('click', function() {
        card.classList.toggle('open');
        if (card.classList.contains('open')) collapseOthers(card);
    });
    typeSelect.addEventListener('change', function() {
        meta.textContent = recipeSchemas[typeSelect.value].label;
        updateRecipeSelect(card);
        updateSaveSummary();
    });
    card.querySelector('.recipe-select').addEventListener('change', updateSaveSummary);
    card.querySelector('.collapse-button').addEventListener('click', function() { card.classList.remove('open'); });
    card.querySelector('.remove-button').addEventListener('click', function() { card.remove(); renumberProcesses(); });
    updateRecipeSelect(card);
    updateSaveSummary();
}

function processDefinitions() {
    return Array.from(document.querySelectorAll('.process-card')).map(function(card) {
        const type = card.querySelector('.process-type').value;
        const recipeSelect = card.querySelector('.recipe-select');
        const recipe = recipes.find(function(item) { return item.entryId === recipeSelect.value; });
        return {
            type: type,
            recipe: recipe || null,
            datetime: card.querySelector('.process-datetime').value,
            comments: card.querySelector('.process-comments').value.trim()
        };
    });
}

function updateSaveSummary() {
    const selectedCount = substrates.filter(function(item) { return item.selected; }).length;
    const count = document.querySelectorAll('.process-card').length;
    const status = document.getElementById('processStatus');
    if (status) status.textContent = selectedCount + ' substrate(s) selected; ' + count + ' process(es) configured.';
}

function safePart(value) {
    return String(value || '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9._-]/g, '');
}

function processArchiveData(definition, selectedSubstrates, index) {
    if (!definition.recipe) throw new Error('Process ' + (index + 1) + ': select a recipe.');
    if (!definition.datetime) throw new Error('Process ' + (index + 1) + ': enter date / time.');
    const schema = recipeSchemas[definition.type];
    if (!schema) throw new Error('Unsupported process type: ' + definition.type);
    selectedSubstrates.forEach(function(substrate) {
        if (!substrate.entryId || !substrate.uploadId) {
            throw new Error(
                'Process ' + (index + 1) +
                ': substrate ' + (substrate.labId || '(unknown)') +
                ' has no valid NOMAD entry/upload reference.'
            );
        }
    });

    const data = {
        m_def: schema.processSchema,
        name: schema.label + ' - ' + selectedSubstrates.length + ' substrate' + (selectedSubstrates.length === 1 ? '' : 's'),
        datetime: new Date(definition.datetime).toISOString(),
        recipe: nomadArchiveReference(definition.recipe.uploadId, definition.recipe.entryId),
        samples: selectedSubstrates.map(function(substrate) {
            return {
                name: substrate.labId,
                lab_id: substrate.labId,
                reference: nomadArchiveReference(substrate.uploadId, substrate.entryId)
            };
        })
    };
    if (definition.comments) data.description = definition.comments;
    return data;
}

async function uploadArchive(uploadId, filename, data) {
    const params = new URLSearchParams();
    params.append('file_name', filename);
    params.append('overwrite_if_exists', 'false');
    params.append('trigger_processing', 'true');
    params.append('wait_for_processing', 'true');
    params.append('include_archive', 'true');

    const response = await fetch(
        nomadApiBase() +
        '/uploads/' +
        encodeURIComponent(uploadId) +
        '/raw/?' +
        params.toString(),
        {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({data: data}, null, 2)
        }
    );

    if (!response.ok) {
        let detail = '';
        try {
            const err = await response.json();
            detail = err.detail ? ': ' + JSON.stringify(err.detail) : '';
        } catch (_) {}
        throw new Error('Process upload failed (' + response.status + ')' + detail);
    }

    const result = await response.json();
    const processing = result.processing || {};
    const entry = processing.entry || {};
    const errors = Array.isArray(entry.errors) ? entry.errors : [];
    const warnings = Array.isArray(entry.warnings) ? entry.warnings : [];

    if (errors.length) {
        throw new Error(
            'NOMAD processing failed: ' + errors.join('; ')
        );
    }

    if (warnings.length) {
        console.warn(
            'NOMAD processing warnings for ' + filename + ':',
            warnings
        );
    }

    return result;
}

async function saveProcesses() {
    const button = document.getElementById('saveProcessesButton');
    const status = document.getElementById('processStatus');
    const uploadId = document.getElementById('targetUpload').value;
    const selected = substrates.filter(function(item) { return item.selected; });
    const definitions = processDefinitions();
    if (!uploadId) { status.textContent = 'Select a target upload first.'; return; }
    if (!selected.length) { status.textContent = 'Select at least one substrate.'; return; }
    if (!definitions.length) { status.textContent = 'Add at least one process.'; return; }

    button.disabled = true;
    let saved = 0;
    try {
        for (let i = 0; i < definitions.length; i++) {
            const definition = definitions[i];
            const data = processArchiveData(definition, selected, i);
            const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '');
            const filename = 'processing_' + safePart(definition.type) + '_' + stamp + '_' + String(i + 1) + '.archive.json';
            status.textContent = 'Saving process ' + (i + 1) + ' of ' + definitions.length + '...';
            await uploadArchive(uploadId, filename, data);
            saved += 1;
        }
        status.textContent = saved + ' process entr' + (saved === 1 ? 'y' : 'ies') + ' saved. NOMAD processing was triggered.';
    } catch (error) {
        status.textContent = (saved ? saved + ' process(es) saved; next process failed: ' : 'Error: ') + error.message;
    } finally {
        button.disabled = false;
    }
}

function applyIncomingSelection() {
    const params = new URLSearchParams(window.location.search);
    const entryId = params.get('substrate_entry_id');
    const returnUrl = params.get('return_url');
    if (entryId) {
        const selected = substrates.find(function(item) { return item.entryId === entryId; });
        if (selected) {
            selected.selected = true;
            document.getElementById('substrateSearch').value = selected.labId;
        }
    }
    if (returnUrl) {
        try {
            const target = new URL(returnUrl, window.location.origin);
            if (target.origin === window.location.origin) {
                const button = document.getElementById('returnButton');
                button.style.display = 'inline-block';
                button.addEventListener('click', function() { window.location.href = target.href; });
            }
        } catch (_) {}
    }
}

async function initialise() {
    try {
        document.getElementById('substrateStatus').textContent = 'Loading substrates...';

        recipeSchemas = await loadProcessTypes();

        [substrates, recipes] = await Promise.all([
            loadSubstrates(),
            loadRecipes()
        ]);

        await loadUploads();
        populateFilter('materialFilter', substrates.map(function(s) { return s.material; }));
        populateFilter('batchFilter', substrates.flatMap(function(s) { return [s.crystalId, s.chargeId]; }));
        populateFilter('orientationFilter', substrates.map(function(s) { return s.orientation; }));
        applyIncomingSelection();
        renderSubstrates();
        addProcess();
        document.getElementById('saveProcessesButton').disabled = false;
        updateSaveSummary();
    } catch (error) {
        console.error(error);
        document.getElementById('substrateStatus').textContent = 'Failed to load NOMAD data.';
        document.getElementById('processStatus').textContent = String(error);
    }
}

['substrateSearch'].forEach(function(id) { document.getElementById(id).addEventListener('input', renderSubstrates); });
['materialFilter', 'batchFilter', 'orientationFilter', 'statusFilter'].forEach(function(id) { document.getElementById(id).addEventListener('change', renderSubstrates); });
document.getElementById('selectAllButton').addEventListener('click', function() {
    filteredSubstrates().forEach(function(substrate) { substrate.selected = true; });
    renderSubstrates(); updateSaveSummary();
});
document.getElementById('clearSelectionButton').addEventListener('click', function() {
    substrates.forEach(function(substrate) { substrate.selected = false; });
    renderSubstrates(); updateSaveSummary();
});
document.getElementById('addProcessButton').addEventListener('click', addProcess);
document.getElementById('saveProcessesButton').addEventListener('click', saveProcesses);

initialise();
