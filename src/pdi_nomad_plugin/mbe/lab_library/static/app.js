let libraryTypes = {};
let currentType = 'processing_recipe';
let currentSubtype = 'annealing';
let currentItems = [];
let allProcessingCatalogs = {};
let usageCatalogs = {};
let editorMode = 'create';
let editorItem = null;

const SIZE_OPTIONS_MM = [5, 10];

function nomadApiBase() {
    if (window.NOMAD_API_BASE) {
        return String(window.NOMAD_API_BASE).replace(/\/$/, '');
    }
    return '/api/v1';
}

function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function geometryNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value && typeof value === 'object' && typeof value.magnitude === 'number') {
        return Number(value.magnitude);
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function geometryXY(geometry) {
    if (!geometry || typeof geometry !== 'object') return null;
    const width = geometryNumber(geometry.width);
    let length = geometryNumber(geometry.length);
    if (!Number.isFinite(width)) return null;
    if (!Number.isFinite(length)) length = width;
    return {width, length};
}

function mm(value) {
    const n = geometryNumber(value);
    return Number.isFinite(n) ? n * 1000 : null;
}

function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

function formatSquareSize(geometry) {
    const xy = geometryXY(geometry);
    if (!xy) return '—';
    const w = xy.width * 1000;
    const l = xy.length * 1000;
    return formatNumber(w) + ' × ' + formatNumber(l) + ' mm';
}

function tagsArray(value) {
    return String(value || '')
        .split(',')
        .map(function(tag) { return tag.trim(); })
        .filter(Boolean);
}

function safeFilenamePart(value) {
    const cleaned = String(value || '')
        .trim()
        .replace(/[^A-Za-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return cleaned || 'library_item';
}

function timestampPart() {
    return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function currentDefinition() {
    if (currentType !== 'processing_recipe') return libraryTypes[currentType];
    const parent = libraryTypes.processing_recipe || {};
    return (parent.schemas || {})[currentSubtype] || {};
}

function currentSchema() {
    return currentDefinition().schema;
}

function currentLabel() {
    if (currentType === 'processing_recipe') {
        return currentDefinition().label + ' Recipes';
    }
    return currentDefinition().label;
}

async function queryEntriesBySchema(schema) {
    const response = await fetch(
        nomadApiBase() + '/entries/archive/query',
        {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                owner: 'visible',
                query: {'section_defs.definition_qualified_name': schema},
                pagination: {page_size: 1000},
                required: {
                    metadata: {
                        entry_name: '*',
                        mainfile: '*',
                        published: '*',
                        entry_references: '*'
                    },
                    data: '*'
                }
            })
        }
    );
    if (!response.ok) throw new Error('NOMAD query failed (' + response.status + ')');
    const result = await response.json();
    return (result.data || []).map(function(entry) {
        const archive = entry.archive || {};
        const metadata = archive.metadata || {};
        return {
            entryId: entry.entry_id,
            uploadId: entry.upload_id,
            entryName: metadata.entry_name || entry.entry_id,
            mainfile: metadata.mainfile || '',
            published: Boolean(metadata.published),
            entryReferences: Array.isArray(metadata.entry_references)
                ? metadata.entry_references
                : [],
            data: archive.data || {}
        };
    });
}

async function loadLibraryTypes() {
    const response = await fetch('library-types');
    if (!response.ok) throw new Error('Could not load library type definitions.');
    libraryTypes = await response.json();
}


function definitionUsageSchemas() {
    const definition = currentDefinition() || {};
    return Array.isArray(definition.usage_schemas)
        ? definition.usage_schemas
        : [];
}

async function preloadUsageCatalogs() {
    const schemaSet = new Set();

    Object.values(libraryTypes || {}).forEach(function(definition) {
        if (definition && definition.schemas) {
            Object.values(definition.schemas).forEach(function(subdefinition) {
                (subdefinition.usage_schemas || []).forEach(function(schema) {
                    schemaSet.add(schema);
                });
            });
        } else {
            (definition.usage_schemas || []).forEach(function(schema) {
                schemaSet.add(schema);
            });
        }
    });

    const pairs = await Promise.all(
        Array.from(schemaSet).map(async function(schema) {
            return [schema, await queryEntriesBySchema(schema)];
        })
    );
    usageCatalogs = Object.fromEntries(pairs);
}

function referenceHitsForEntry(item) {
    const targetEntryId = item && item.entryId;
    if (!targetEntryId) return [];

    const hits = [];
    definitionUsageSchemas().forEach(function(schema) {
        (usageCatalogs[schema] || []).forEach(function(source) {
            const refs = Array.isArray(source.entryReferences)
                ? source.entryReferences
                : [];
            refs.forEach(function(ref) {
                if (ref && ref.target_entry_id === targetEntryId) {
                    hits.push({
                        schema: schema,
                        sourceEntryId: source.entryId,
                        sourceEntryName: source.entryName,
                        sourceMainfile: source.mainfile,
                        sourcePath: ref.source_path || '',
                        sourceQuantity: ref.source_quantity || ''
                    });
                }
            });
        });
    });
    return hits;
}

function itemUsage(item) {
    const hits = referenceHitsForEntry(item);
    return {
        count: hits.length,
        hits: hits,
        locked: hits.length > 0
    };
}

function normalizeLabId(value) {
    return String(value || '').trim().toUpperCase();
}

function allIdsForCurrentType() {
    const values = currentType === 'processing_recipe'
        ? (allProcessingCatalogs[currentSubtype] || [])
        : currentItems;
    return values
        .map(function(item) {
            return normalizeLabId((item.data || {}).lab_id || item.entryName);
        })
        .filter(Boolean);
}

function assertUniqueGeneratedId(id) {
    const normalized = normalizeLabId(id);
    if (!normalized) throw new Error('Generated ID is empty.');

    const collision = allIdsForCurrentType().some(function(existing) {
        if (
            editorMode === 'edit' &&
            editorItem &&
            normalizeLabId((editorItem.data || {}).lab_id || editorItem.entryName) === existing
        ) {
            return false;
        }
        return existing === normalized;
    });

    if (collision) {
        throw new Error(
            'ID ' + id + ' already exists. Change the structured fields before saving.'
        );
    }
}

async function preloadProcessingCatalogs() {
    const defs = (libraryTypes.processing_recipe || {}).schemas || {};
    const entries = await Promise.all(
        Object.entries(defs).map(async function([key, def]) {
            return [key, await queryEntriesBySchema(def.schema)];
        })
    );
    allProcessingCatalogs = Object.fromEntries(entries);
}

function renderTypeTabs() {
    const box = document.getElementById('typeTabs');
    box.innerHTML = '';
    Object.entries(libraryTypes).forEach(function([key, def]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'type-tab' + (key === currentType ? ' active' : '');
        button.textContent = def.label;
        button.addEventListener('click', function() {
            currentType = key;
            renderTypeTabs();
            renderSubtypeTabs();
            loadCurrentType();
        });
        box.appendChild(button);
    });
}

function renderSubtypeTabs() {
    const box = document.getElementById('subtypeTabs');
    if (currentType !== 'processing_recipe') {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }
    box.classList.remove('hidden');
    box.innerHTML = '';
    const defs = (libraryTypes.processing_recipe || {}).schemas || {};
    Object.entries(defs).forEach(function([key, def]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'subtype-tab' + (key === currentSubtype ? ' active' : '');
        button.textContent = def.label;
        button.addEventListener('click', function() {
            currentSubtype = key;
            renderSubtypeTabs();
            loadCurrentType();
        });
        box.appendChild(button);
    });
}

function itemTitle(item) {
    const data = item.data || {};
    return data.lab_id || data.name || item.entryName || item.entryId;
}

function itemSecondary(item) {
    const data = item.data || {};
    const bits = [];
    if (data.name && data.name !== itemTitle(item)) bits.push(data.name);

    const usage = itemUsage(item);
    if (usage.locked) {
        bits.push('Locked · referenced by ' + usage.count + ' NOMAD entr' +
            (usage.count === 1 ? 'y' : 'ies'));
    } else {
        bits.push(item.published ? 'Published' : 'Unused · editable');
    }
    return bits.join(' · ');
}

function scalarSummary(data) {
    const skip = new Set([
        'm_def', 'name', 'lab_id', 'datetime', 'samples', 'recipe',
        'starting_time', 'ending_time', 'location'
    ]);
    const bits = [];
    Object.entries(data || {}).forEach(function([key, value]) {
        if (skip.has(key)) return;
        if (value === null || value === undefined) return;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            bits.push(key.replaceAll('_', ' ') + ': ' + String(value));
        }
    });
    return bits.slice(0, 4).join(' · ');
}

function itemDetail(item) {
    const data = item.data || {};
    if (currentType === 'processing_recipe') return scalarSummary(data) || 'Recipe parameters stored in NOMAD';
    if (currentType === 'sample_cut_recipe') {
        return (
            'Parent ' + formatSquareSize(data.input_geometry) +
            ' → ' + (data.number_of_samples || '—') +
            ' × ' + formatSquareSize(data.children_geometry)
        );
    }
    if (currentType === 'holder') {
        const positions = Array.isArray(data.positions) ? data.positions : [];
        const size = inferHolderSizeMm(data);
        return positions.length + ' position(s)' + (size ? ' · ' + formatNumber(size) + ' × ' + formatNumber(size) + ' mm' : '');
    }
    if (currentType === 'insert') {
        return (
            'Outer ' + formatSquareSize(data.outer_geometry) +
            ' · Opening ' + formatSquareSize(data.inner_geometry)
        );
    }
    return '';
}

function filteredItems() {
    const q = document.getElementById('librarySearch').value.trim().toLowerCase();
    if (!q) return currentItems;
    return currentItems.filter(function(item) {
        return JSON.stringify({entryName:item.entryName, data:item.data}).toLowerCase().includes(q);
    });
}

function createRowLabel() {
    if (currentType === 'processing_recipe') return '+ Create new ' + currentDefinition().label.toLowerCase() + ' recipe';
    if (currentType === 'sample_cut_recipe') return '+ Create new sample cut recipe';
    if (currentType === 'holder') return '+ Create new holder';
    if (currentType === 'insert') return '+ Create new insert';
    return '+ Create new item';
}

function renderLibrary() {
    const list = document.getElementById('libraryList');
    const status = document.getElementById('libraryStatus');
    const items = filteredItems();

    status.textContent = items.length + ' of ' + currentItems.length + ' ' + currentLabel().toLowerCase() + ' shown.';
    list.innerHTML = '';

    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No matching library items.';
        list.appendChild(empty);
    }

    items.forEach(function(item) {
        const row = document.createElement('div');
        row.className = 'library-row';

        const identity = document.createElement('div');
        identity.innerHTML =
            '<div class="item-title">' + escapeHtml(itemTitle(item)) + '</div>' +
            '<div class="item-subtitle">' + escapeHtml(itemSecondary(item)) + '</div>';

        const type = document.createElement('div');
        type.className = 'item-type';
        type.textContent = currentLabel();

        const detail = document.createElement('div');
        detail.className = 'item-details';
        detail.textContent = itemDetail(item);

        const actions = document.createElement('div');
        actions.className = 'item-actions';

        const view = document.createElement('button');
        view.type = 'button';
        view.textContent = 'View';
        view.addEventListener('click', function() { openView(item); });

        const usage = itemUsage(item);

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.disabled =
            usage.locked ||
            item.published ||
            !item.mainfile ||
            !item.uploadId;
        edit.title = usage.locked
            ? 'Locked because this item is referenced by NOMAD entries.'
            : (
                item.published
                    ? 'Published entries are read-only.'
                    : ''
            );
        edit.addEventListener('click', function() { openEditor('edit', item); });

        const duplicate = document.createElement('button');
        duplicate.type = 'button';
        duplicate.textContent = 'Duplicate';
        duplicate.addEventListener('click', function() { openEditor('duplicate', item); });

        actions.append(view, edit, duplicate);
        row.append(identity, type, detail, actions);
        list.appendChild(row);
    });

    const create = document.createElement('div');
    create.className = 'create-row';
    create.innerHTML = '<span class="create-plus">+</span><span>' + escapeHtml(createRowLabel().replace(/^\+\s*/, '')) + '</span>';
    create.addEventListener('click', function() { openEditor('create', null); });
    list.appendChild(create);
}

async function loadCurrentType() {
    const status = document.getElementById('libraryStatus');
    status.textContent = 'Loading ' + currentLabel().toLowerCase() + ' from NOMAD...';
    document.getElementById('libraryList').innerHTML = '';
    try {
        if (currentType === 'processing_recipe' && allProcessingCatalogs[currentSubtype]) {
            currentItems = allProcessingCatalogs[currentSubtype];
        } else {
            currentItems = await queryEntriesBySchema(currentSchema());
        }
        currentItems = [...currentItems].sort(function(a,b) {
            return itemTitle(a).localeCompare(itemTitle(b));
        });
        renderLibrary();
    } catch (error) {
        currentItems = [];
        status.textContent = 'Error: ' + error.message;
    }
}

function openModal() { document.getElementById('modalBackdrop').classList.remove('hidden'); }

function closeModal() {
    document.getElementById('modalBackdrop').classList.add('hidden');
    document.getElementById('viewPanel').classList.add('hidden');
    document.getElementById('editorForm').classList.add('hidden');
    editorItem = null;
}

function viewRow(label, value) {
    return '<div class="view-label">' + escapeHtml(label) + '</div><div>' + escapeHtml(value) + '</div>';
}

function openView(item) {
    const data = item.data || {};
    document.getElementById('modalTitle').textContent = itemTitle(item);
    document.getElementById('modalSubtitle').textContent = currentLabel() + ' · ' + item.entryId;
    const panel = document.getElementById('viewPanel');
    document.getElementById('editorForm').classList.add('hidden');
    panel.classList.remove('hidden');

    let summary = '';
    summary += viewRow('Type', currentLabel());
    summary += viewRow('ID', data.lab_id || '—');
    const usage = itemUsage(item);
    summary += viewRow(
        'State',
        usage.locked
            ? 'Locked / referenced'
            : (item.published ? 'Published / read-only' : 'Unused / editable')
    );
    summary += viewRow('References', usage.count ? String(usage.count) : '0');
    summary += viewRow('Mainfile', item.mainfile || '—');
    panel.innerHTML =
        '<div class="view-grid">' + summary + '</div>' +
        '<h3>Archive data</h3><div class="view-raw">' +
        escapeHtml(JSON.stringify(data, null, 2)) + '</div>';
    openModal();
}

function fillSizeSelect(id, includeOther) {
    const select = document.getElementById(id);
    select.innerHTML = '';
    SIZE_OPTIONS_MM.forEach(function(size) {
        const option = document.createElement('option');
        option.value = String(size);
        option.textContent = size + ' × ' + size + ' mm';
        select.appendChild(option);
    });
    if (includeOther !== false) {
        const custom = document.createElement('option');
        custom.value = 'other';
        custom.textContent = 'Other…';
        select.appendChild(custom);
    }
}

function setSizeSelect(selectId, wrapId, customId, sizeMm) {
    const select = document.getElementById(selectId);
    const known = SIZE_OPTIONS_MM.some(function(value) { return Math.abs(value - sizeMm) < 1e-9; });
    if (known) {
        select.value = String(sizeMm);
        document.getElementById(wrapId).classList.add('hidden');
    } else {
        select.value = 'other';
        document.getElementById(wrapId).classList.remove('hidden');
        document.getElementById(customId).value = sizeMm ? formatNumber(sizeMm) : '';
    }
}

function selectedSquareSize(selectId, customId) {
    const selected = document.getElementById(selectId).value;
    if (selected !== 'other') return Number(selected);
    const value = Number(document.getElementById(customId).value);
    if (!Number.isFinite(value) || value <= 0) throw new Error('Custom size must be greater than zero.');
    return value;
}

function attachSizeToggle(selectId, wrapId) {
    document.getElementById(selectId).addEventListener('change', function(event) {
        document.getElementById(wrapId).classList.toggle('hidden', event.target.value !== 'other');
        updateGeneratedId();
    });
}

function inferHolderSizeMm(data) {
    const positions = Array.isArray(data.positions) ? data.positions : [];
    for (const position of positions) {
        const xy = geometryXY(position.slot_geometry);
        if (xy && Math.abs(xy.width - xy.length) < 1e-12) return xy.width * 1000;
    }
    const match = String(data.lab_id || '').match(/^[HM]\d+_(\d+(?:\.\d+)?)$/);
    return match ? Number(match[1]) : null;
}

function parseHolderId(id) {
    const match = String(id || '').match(/^([HM])(\d+)_(\d+(?:\.\d+)?)$/);
    return match ? {material:match[1], number:Number(match[2]), size:Number(match[3])} : null;
}

function parseInsertId(id) {
    const match = String(id || '').match(/^([A-Z][A-Z0-9]*)(\d+)_(\d+(?:\.\d+)?)$/);
    return match ? {family:match[1], number:Number(match[2]), size:Number(match[3])} : null;
}

function nextSequentialId(prefix, items) {
    let max = 0;
    const pattern = new RegExp('^' + prefix + '_(\\d+)$');
    items.forEach(function(item) {
        const match = String((item.data || {}).lab_id || '').match(pattern);
        if (match) max = Math.max(max, Number(match[1]));
    });
    return prefix + '_' + String(max + 1).padStart(3, '0');
}

function generatedId() {
    if (currentType === 'processing_recipe') {
        const prefix = currentDefinition().id_prefix || 'RECIPE';
        if (editorMode === 'edit' && editorItem && (editorItem.data || {}).lab_id) {
            return editorItem.data.lab_id;
        }
        return nextSequentialId(prefix, allProcessingCatalogs[currentSubtype] || []);
    }

    if (currentType === 'sample_cut_recipe') {
        const parent = selectedSquareSize('cutParentSize', 'cutParentCustom');
        const child = selectedSquareSize('cutChildSize', 'cutChildCustom');
        const count = Number(document.getElementById('cutChildCount').value || 1);
        return 'CUT_' + formatNumber(parent) + '_TO_' + formatNumber(count) + 'X' + formatNumber(child);
    }

    if (currentType === 'holder') {
        const material = document.getElementById('holderMaterial').value;
        const number = Number(document.getElementById('holderNumber').value || 1);
        const size = selectedSquareSize('holderSize', 'holderCustomSize');
        return material + String(number) + '_' + formatNumber(size);
    }

    if (currentType === 'insert') {
        let family = document.getElementById('insertFamily').value;
        if (family === 'CUSTOM') {
            family = document.getElementById('insertFamilyCustom').value.trim().toUpperCase();
            if (!/^[A-Z][A-Z0-9]*$/.test(family)) return 'INVALID_FAMILY';
        }
        const number = Number(document.getElementById('insertNumber').value || 1);
        const opening = selectedSquareSize('insertInnerSize', 'insertInnerCustom');
        return family + String(number) + '_' + formatNumber(opening);
    }
    return '—';
}

function updateGeneratedId() {
    try {
        document.getElementById('generatedIdValue').textContent = generatedId();
    } catch (_) {
        document.getElementById('generatedIdValue').textContent = '—';
    }
}

function clearHolderPositions() { document.getElementById('holderPositions').innerHTML = ''; }

function addHolderPosition(position) {
    position = position || {};
    const row = document.createElement('div');
    row.className = 'holder-position-row';

    function input(className, value, type, step) {
        const element = document.createElement('input');
        element.className = className;
        element.type = type || 'number';
        if (step) element.step = step;
        element.value = value === undefined || value === null ? '' : String(value);
        return element;
    }

    row.append(
        input('position-name', position.name || '', 'text'),
        input('position-x', mm(position.x_position), 'number', '0.01'),
        input('position-y', mm(position.y_position), 'number', '0.01'),
        input('position-rho', mm(position.rho), 'number', '0.01'),
        input('position-theta', geometryNumber(position.theta), 'number', '0.1')
    );

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-position';
    remove.textContent = '×';
    remove.addEventListener('click', function() { row.remove(); });
    row.appendChild(remove);
    document.getElementById('holderPositions').appendChild(row);
}

function fieldValuesFromCatalog(field) {
    const values = [];
    (allProcessingCatalogs[currentSubtype] || []).forEach(function(item) {
        const value = (item.data || {})[field];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            if (!values.some(function(existing) { return String(existing) === String(value); })) {
                values.push(value);
            }
        }
    });
    return values;
}

function dynamicScalarFields() {
    const definition = currentDefinition() || {};
    if (Array.isArray(definition.fields)) {
        return definition.fields;
    }
    return [];
}

function friendlyFieldLabel(field) {
    const labels = {
        temperature: 'Temperature',
        duration: 'Duration',
        chemical_formula: 'Chemical formula',
        material: 'Material'
    };
    return labels[field] || field.replaceAll('_', ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

function renderProcessingDynamicFields(seedData) {
    const container = document.getElementById('processingDynamicFields');
    container.innerHTML = '';
    const fields = dynamicScalarFields();
    if (!fields.length) {
        container.innerHTML = '<div class="helper">No scalar recipe parameters were found in the existing library entries. The new recipe will contain only its generated ID until parameters are added by the schema editor.</div>';
        return;
    }

    fields.forEach(function(field) {
        const wrapper = document.createElement('div');
        wrapper.className = 'dynamic-field';
        wrapper.dataset.field = field;

        const label = document.createElement('label');
        label.textContent = friendlyFieldLabel(field);

        const select = document.createElement('select');
        select.className = 'dynamic-select';
        select.dataset.field = field;

        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = 'Not set';
        select.appendChild(blank);

        fieldValuesFromCatalog(field).forEach(function(value) {
            const option = document.createElement('option');
            option.value = JSON.stringify(value);
            option.textContent = String(value);
            select.appendChild(option);
        });

        const custom = document.createElement('option');
        custom.value = '__custom__';
        custom.textContent = 'Custom value…';
        select.appendChild(custom);

        const customInput = document.createElement('input');
        customInput.className = 'custom-value hidden';
        customInput.dataset.field = field;
        customInput.placeholder = field === 'chemical_formula' ? 'e.g. SrTiO3' : 'Custom value';

        const initial = (seedData || {})[field];
        if (initial !== undefined && initial !== null) {
            const encoded = JSON.stringify(initial);
            if (Array.from(select.options).some(function(option) { return option.value === encoded; })) {
                select.value = encoded;
            } else {
                select.value = '__custom__';
                customInput.classList.remove('hidden');
                customInput.value = String(initial);
            }
        }

        select.addEventListener('change', function() {
            customInput.classList.toggle('hidden', select.value !== '__custom__');
        });

        wrapper.append(label, select, customInput);
        container.appendChild(wrapper);
    });
}

function populateProcessingTemplate(seedData) {
    const select = document.getElementById('processingTemplate');
    select.innerHTML = '<option value="">Blank recipe</option>';
    (allProcessingCatalogs[currentSubtype] || []).forEach(function(item, index) {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = itemTitle(item);
        select.appendChild(option);
    });

    select.onchange = function() {
        if (select.value === '') {
            renderProcessingDynamicFields({});
        } else {
            const item = (allProcessingCatalogs[currentSubtype] || [])[Number(select.value)];
            renderProcessingDynamicFields(item ? item.data : {});
        }
    };

    renderProcessingDynamicFields(seedData || {});
}

function populateEditor(data) {
    data = data || {};
    ['processingFields','sampleCutFields','holderFields','insertFields'].forEach(function(id) {
        document.getElementById(id).classList.add('hidden');
    });

    if (currentType === 'processing_recipe') {
        document.getElementById('processingFields').classList.remove('hidden');
        populateProcessingTemplate(data);
    }

    if (currentType === 'sample_cut_recipe') {
        document.getElementById('sampleCutFields').classList.remove('hidden');
        const parent = geometryXY(data.input_geometry);
        const child = geometryXY(data.children_geometry);
        setSizeSelect('cutParentSize','cutParentCustomWrap','cutParentCustom',parent ? parent.width * 1000 : 10);
        setSizeSelect('cutChildSize','cutChildCustomWrap','cutChildCustom',child ? child.width * 1000 : 5);
        document.getElementById('cutChildCount').value = String(Number(data.number_of_samples) || 4);
    }

    if (currentType === 'holder') {
        document.getElementById('holderFields').classList.remove('hidden');
        const parsed = parseHolderId(data.lab_id);
        document.getElementById('holderMaterial').value = parsed ? parsed.material : 'H';
        document.getElementById('holderNumber').value = parsed ? parsed.number : 1;
        const size = parsed ? parsed.size : (inferHolderSizeMm(data) || 10);
        setSizeSelect('holderSize','holderCustomSizeWrap','holderCustomSize',size);

        clearHolderPositions();
        const positions = Array.isArray(data.positions) ? data.positions : [];
        positions.forEach(addHolderPosition);
        if (!positions.length) {
            ['A','B','C','D','E'].forEach(function(name) { addHolderPosition({name:name}); });
        }
        document.getElementById('holderTags').value = Array.isArray(data.tags) ? data.tags.join(', ') : '';
    }

    if (currentType === 'insert') {
        document.getElementById('insertFields').classList.remove('hidden');
        const parsed = parseInsertId(data.lab_id);
        const knownFamily = parsed && ['XPS','MBE'].includes(parsed.family) ? parsed.family : null;
        document.getElementById('insertFamily').value = knownFamily || (parsed ? 'CUSTOM' : 'XPS');
        document.getElementById('insertFamilyCustomWrap').classList.toggle('hidden', Boolean(knownFamily) || !parsed);
        document.getElementById('insertFamilyCustom').value = parsed && !knownFamily ? parsed.family : '';
        document.getElementById('insertNumber').value = parsed ? parsed.number : 1;

        const outer = geometryXY(data.outer_geometry);
        const inner = geometryXY(data.inner_geometry);
        setSizeSelect('insertOuterSize','insertOuterCustomWrap','insertOuterCustom',outer ? outer.width * 1000 : 10);
        setSizeSelect('insertInnerSize','insertInnerCustomWrap','insertInnerCustom',inner ? inner.width * 1000 : 5);
        document.getElementById('insertTags').value = Array.isArray(data.tags) ? data.tags.join(', ') : '';
    }

    updateGeneratedId();
}

function entityNoun() {
    if (currentType === 'processing_recipe' || currentType === 'sample_cut_recipe') return 'recipe';
    if (currentType === 'holder') return 'holder';
    if (currentType === 'insert') return 'insert';
    return 'item';
}

async function openEditor(mode, item) {
    if (mode === 'edit' && item) {
        const usage = itemUsage(item);
        if (usage.locked) {
            window.alert(
                'This item is locked because it is already referenced by NOMAD entries. ' +
                'Use Duplicate to create a new independent item.'
            );
            return;
        }
    }

    editorMode = mode;
    editorItem = item || null;
    document.getElementById('viewPanel').classList.add('hidden');
    document.getElementById('editorForm').classList.remove('hidden');
    document.getElementById('editorStatus').textContent = '';

    populateEditor(item ? JSON.parse(JSON.stringify(item.data || {})) : {});

    const target = document.getElementById('targetUploadFields');
    target.classList.toggle('hidden', mode === 'edit');

    if (mode === 'edit') {
        document.getElementById('modalTitle').textContent = 'Edit ' + itemTitle(item);
        document.getElementById('modalSubtitle').textContent = item.mainfile || item.entryId;
        document.getElementById('saveEditorButton').textContent = 'Save changes';
    } else {
        document.getElementById('modalTitle').textContent =
            mode === 'duplicate' ? 'New ' + entityNoun() + ' from ' + itemTitle(item) : 'Create new ' + entityNoun();
        document.getElementById('modalSubtitle').textContent =
            mode === 'duplicate'
                ? 'A new independent NOMAD entry will be created from this definition.'
                : currentLabel();
        document.getElementById('saveEditorButton').textContent = 'Save new ' + entityNoun();
    }

    document.getElementById('generatedIdHint').textContent =
        mode === 'edit'
            ? 'Existing ID is preserved while editing.'
            : 'The ID is generated from the structured fields and cannot be typed freely.';

    openModal();
}

function validateFormula(value) {
    return /^[A-Z][A-Za-z0-9().+\-]*$/.test(value) && !/^(STO|DSO|GSO|BSO|LAO|KTO|LSAT)$/i.test(value);
}

function readDynamicFields(data) {
    document.querySelectorAll('.dynamic-field').forEach(function(wrapper) {
        const field = wrapper.dataset.field;
        const select = wrapper.querySelector('.dynamic-select');
        const custom = wrapper.querySelector('.custom-value');
        if (!select || select.value === '') {
            delete data[field];
            return;
        }

        let value;
        if (select.value === '__custom__') {
            const raw = custom.value.trim();
            if (!raw) throw new Error(friendlyFieldLabel(field) + ' custom value is empty.');

            const examples = fieldValuesFromCatalog(field);
            const numeric = examples.some(function(example) { return typeof example === 'number'; });
            const boolean = examples.some(function(example) { return typeof example === 'boolean'; });

            if (numeric) {
                value = Number(raw);
                if (!Number.isFinite(value)) throw new Error(friendlyFieldLabel(field) + ' must be numeric.');
            } else if (boolean) {
                if (!['true','false'].includes(raw.toLowerCase())) throw new Error(friendlyFieldLabel(field) + ' must be true or false.');
                value = raw.toLowerCase() === 'true';
            } else {
                value = raw;
            }
        } else {
            value = JSON.parse(select.value);
        }

        if ((field === 'chemical_formula' || field === 'material') && typeof value === 'string') {
            if (!validateFormula(value)) {
                throw new Error(
                    friendlyFieldLabel(field) +
                    ' must use the full chemical formula, e.g. SrTiO3, not an abbreviation such as STO.'
                );
            }
        }
        data[field] = value;
    });
}

function editorArchiveData() {
    const existing = editorItem && editorMode === 'edit'
        ? JSON.parse(JSON.stringify(editorItem.data || {}))
        : {};
    const data = existing;
    data.m_def = currentSchema();
    data.lab_id = generatedId();
    data.name = data.lab_id;

    if (editorMode !== 'edit') {
        assertUniqueGeneratedId(data.lab_id);
    } else if (editorItem && itemUsage(editorItem).locked) {
        throw new Error(
            'This item became referenced after the editor was opened. ' +
            'Editing is blocked; use Duplicate instead.'
        );
    }

    if (currentType === 'processing_recipe') {
        if (editorMode !== 'edit') {
            const template = document.getElementById('processingTemplate').value;
            if (template !== '') {
                Object.assign(data, JSON.parse(JSON.stringify((allProcessingCatalogs[currentSubtype][Number(template)] || {}).data || {})));
                data.m_def = currentSchema();
                data.lab_id = generatedId();
                data.name = data.lab_id;
            }
        }
        readDynamicFields(data);
    }

    if (currentType === 'sample_cut_recipe') {
        const parent = selectedSquareSize('cutParentSize','cutParentCustom');
        const child = selectedSquareSize('cutChildSize','cutChildCustom');
        const count = Number(document.getElementById('cutChildCount').value);
        if (!Number.isInteger(count) || count < 1) throw new Error('Children per parent must be a positive integer.');
        data.input_geometry = {width:parent/1000, length:parent/1000};
        data.number_of_samples = count;
        data.children_geometry = {width:child/1000, length:child/1000};
    }

    if (currentType === 'holder') {
        const size = selectedSquareSize('holderSize','holderCustomSize');
        const rows = Array.from(document.querySelectorAll('.holder-position-row'));
        if (!rows.length) throw new Error('A holder needs at least one position.');
        const names = new Set();
        data.positions = rows.map(function(row, index) {
            const name = row.querySelector('.position-name').value.trim().toUpperCase();
            if (!/^[A-Z][A-Z0-9]*$/.test(name)) throw new Error('Holder position names must use uppercase letters/numbers.');
            if (names.has(name)) throw new Error('Holder position names must be unique.');
            names.add(name);

            function optional(selector, scale) {
                const raw = row.querySelector(selector).value.trim();
                if (raw === '') return null;
                const value = Number(raw);
                if (!Number.isFinite(value)) throw new Error('Invalid number in holder position ' + name + '.');
                return scale ? value / scale : value;
            }

            const result = {
                name:name,
                slot_geometry:{width:size/1000, length:size/1000}
            };
            const x = optional('.position-x',1000);
            const y = optional('.position-y',1000);
            const rho = optional('.position-rho',1000);
            const theta = optional('.position-theta');
            if (x !== null) result.x_position = x;
            if (y !== null) result.y_position = y;
            if (rho !== null) result.rho = rho;
            if (theta !== null) result.theta = theta;
            return result;
        });
        data.number_of_positions = data.positions.length;
        data.tags = tagsArray(document.getElementById('holderTags').value);
    }

    if (currentType === 'insert') {
        const outer = selectedSquareSize('insertOuterSize','insertOuterCustom');
        const inner = selectedSquareSize('insertInnerSize','insertInnerCustom');
        if (inner > outer) throw new Error('Sample opening cannot be larger than the outer insert size.');
        data.outer_geometry = {width:outer/1000, length:outer/1000};
        data.inner_geometry = {width:inner/1000, length:inner/1000};
        data.tags = tagsArray(document.getElementById('insertTags').value);
    }

    return data;
}

async function uploadArchive(uploadId, filename, data, overwrite) {
    const params = new URLSearchParams();
    params.append('file_name', filename);
    params.append('overwrite_if_exists', overwrite ? 'true' : 'false');
    params.append('trigger_processing', 'true');
    params.append('wait_for_processing', 'true');
    params.append('include_archive', 'true');

    const response = await fetch(
        nomadApiBase() + '/uploads/' + encodeURIComponent(uploadId) + '/raw/?' + params.toString(),
        {
            method:'PUT',
            headers:{'Content-Type':'application/json','Accept':'application/json'},
            body:JSON.stringify({data:data}, null, 2)
        }
    );
    if (!response.ok) throw new Error('Archive upload failed (' + response.status + ')');
    const result = await response.json();
    const errors = (((result || {}).processing || {}).entry || {}).errors || [];
    if (errors.length) throw new Error('NOMAD processing failed: ' + errors.join('; '));
    return result;
}

async function saveEditor(event) {
    event.preventDefault();
    const button = document.getElementById('saveEditorButton');
    const status = document.getElementById('editorStatus');
    button.disabled = true;
    try {
        const data = editorArchiveData();
        let uploadId;
        let filename;
        let overwrite = false;

        if (editorMode === 'edit') {
            if (!editorItem || editorItem.published || !editorItem.uploadId || !editorItem.mainfile) {
                throw new Error('This item cannot be edited in place.');
            }

            for (const schema of definitionUsageSchemas()) {
                usageCatalogs[schema] = await queryEntriesBySchema(schema);
            }
            if (itemUsage(editorItem).locked) {
                throw new Error(
                    'This item is now referenced by NOMAD and is locked. ' +
                    'No changes were written.'
                );
            }

            uploadId = editorItem.uploadId;
            filename = editorItem.mainfile;
            overwrite = true;
            status.textContent = 'Saving changes...';
        } else {
            const latestItems = await queryEntriesBySchema(currentSchema());
            if (currentType === 'processing_recipe') {
                allProcessingCatalogs[currentSubtype] = latestItems;
            } else {
                currentItems = latestItems;
            }
            assertUniqueGeneratedId(data.lab_id);

            uploadId = document.getElementById('targetUpload').value;
            if (!uploadId) throw new Error('Select a target upload first.');
            filename = safeFilenamePart(data.lab_id) + '_' + timestampPart() + '.archive.yaml';
            status.textContent = 'Creating new ' + entityNoun() + '...';
        }

        await uploadArchive(uploadId, filename, data, overwrite);
        status.textContent = 'Saved successfully.';

        if (currentType === 'processing_recipe') {
            allProcessingCatalogs[currentSubtype] = await queryEntriesBySchema(currentSchema());
        }
        await loadCurrentType();
        closeModal();
    } catch (error) {
        status.textContent = 'Error: ' + error.message;
    } finally {
        button.disabled = false;
    }
}

async function loadUploads() {
    const select = document.getElementById('targetUpload');
    const status = document.getElementById('uploadStatus');
    select.innerHTML = '<option value="">Loading uploads...</option>';
    try {
        const params = new URLSearchParams();
        params.append('roles','main_author');
        params.append('roles','coauthor');
        params.append('page_size','100');
        const response = await fetch(nomadApiBase() + '/uploads?' + params.toString());
        if (!response.ok) throw new Error('Upload request failed: ' + response.status);
        const result = await response.json();
        const uploads = (result.data || []).filter(function(upload) {
            return !upload.published && !upload.is_processing;
        });
        select.innerHTML = '<option value="">Select target upload...</option>';
        uploads.forEach(function(upload) {
            const option = document.createElement('option');
            option.value = upload.upload_id;
            option.textContent = (upload.upload_name || 'Unnamed upload') + ' — ' + upload.upload_id;
            select.appendChild(option);
        });
        status.textContent = uploads.length + ' writable unpublished upload(s) available.';
    } catch (error) {
        select.innerHTML = '<option value="">Could not load uploads</option>';
        status.textContent = 'Error: ' + error.message;
    }
}

function populateStaticControls() {
    ['cutParentSize','cutChildSize','holderSize','insertOuterSize','insertInnerSize'].forEach(function(id) {
        fillSizeSelect(id, true);
    });

    const childCount = document.getElementById('cutChildCount');
    [1,2,4,6,8,9,16].forEach(function(count) {
        const option = document.createElement('option');
        option.value = String(count);
        option.textContent = String(count);
        childCount.appendChild(option);
    });

    attachSizeToggle('cutParentSize','cutParentCustomWrap');
    attachSizeToggle('cutChildSize','cutChildCustomWrap');
    attachSizeToggle('holderSize','holderCustomSizeWrap');
    attachSizeToggle('insertOuterSize','insertOuterCustomWrap');
    attachSizeToggle('insertInnerSize','insertInnerCustomWrap');

    ['holderMaterial','holderNumber','cutChildCount','insertNumber','insertFamily'].forEach(function(id) {
        document.getElementById(id).addEventListener('input', function() {
            if (id === 'insertFamily') {
                document.getElementById('insertFamilyCustomWrap').classList.toggle(
                    'hidden',
                    document.getElementById('insertFamily').value !== 'CUSTOM'
                );
            }
            updateGeneratedId();
        });
    });

    ['holderCustomSize','cutParentCustom','cutChildCustom','insertOuterCustom','insertInnerCustom','insertFamilyCustom'].forEach(function(id) {
        document.getElementById(id).addEventListener('input', updateGeneratedId);
    });
}

async function initialise() {
    populateStaticControls();

    document.getElementById('librarySearch').addEventListener('input', renderLibrary);
    document.getElementById('closeModalButton').addEventListener('click', closeModal);
    document.getElementById('cancelEditorButton').addEventListener('click', closeModal);
    document.getElementById('editorForm').addEventListener('submit', saveEditor);
    document.getElementById('addHolderPositionButton').addEventListener('click', function() {
        addHolderPosition({name:''});
    });
    document.getElementById('modalBackdrop').addEventListener('click', function(event) {
        if (event.target === event.currentTarget) closeModal();
    });

    try {
        await loadLibraryTypes();
        await Promise.all([
            preloadProcessingCatalogs(),
            preloadUsageCatalogs()
        ]);
        renderTypeTabs();
        renderSubtypeTabs();
        await Promise.all([loadCurrentType(), loadUploads()]);
    } catch (error) {
        document.getElementById('libraryStatus').textContent = 'Error: ' + error.message;
    }
}

document.addEventListener('DOMContentLoaded', initialise);
