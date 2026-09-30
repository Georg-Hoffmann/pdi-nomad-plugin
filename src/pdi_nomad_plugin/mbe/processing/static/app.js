function nomadApiBase() {
    const marker = '/gui/';
    const pathname = window.location.pathname;
    const index = pathname.indexOf(marker);

    const deploymentBase =
        index >= 0 ? pathname.slice(0, index) : '';

    return deploymentBase + '/api/v1';
}


const recipeSchemas = {
    cleaning: {
        label: 'Cleaning',
        schema:
            'pdi_nomad_plugin.general.schema.CleaningRecipePDI'
    },
    annealing: {
        label: 'Annealing',
        schema:
            'pdi_nomad_plugin.general.schema.AnnealingRecipePDI'
    },
    etching: {
        label: 'Etching',
        schema:
            'pdi_nomad_plugin.general.schema.EtchingRecipePDI'
    },
    back_side_coating: {
        label: 'Back-side coating',
        schema:
            'pdi_nomad_plugin.general.schema.BackSideCoatingRecipePDI'
    }
};

let substrates = [];
let recipes = [];
let processCounter = 0;


async function queryEntries(schema, pageSize, include) {
    const response = await fetch(
        nomadApiBase() + '/entries/query',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: {
                    'section_defs.definition_qualified_name': schema
                },
                pagination: {
                    page_size: pageSize
                },
                required: {
                    include: include
                }
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            'NOMAD query failed for ' +
            schema +
            ': ' +
            response.status
        );
    }

    const result = await response.json();
    return result.data || [];
}


async function loadSubstrates() {
    const entries = await queryEntries(
        'pdi_nomad_plugin.mbe.materials.SubstrateMbe',
        500,
        [
            'entry_id',
            'upload_id',
            'entry_name',
            'data.lab_id',
            'data.material_designation',
            'data.surface_orientation_label'
        ]
    );

    return entries.map(function(entry) {
        const data = entry.data || {};

        return {
            entryId: entry.entry_id,
            uploadId: entry.upload_id,
            labId:
                data.lab_id ||
                entry.entry_name ||
                entry.entry_id,
            material:
                data.material_designation || '',
            orientation:
                data.surface_orientation_label || '',
            selected: false
        };
    });
}


async function loadRecipes() {
    const result = [];

    for (const [type, definition] of Object.entries(recipeSchemas)) {
        const entries = await queryEntries(
            definition.schema,
            100,
            [
                'entry_id',
                'upload_id',
                'entry_name'
            ]
        );

        entries.forEach(function(entry) {
            result.push({
                type: type,
                entryId: entry.entry_id,
                uploadId: entry.upload_id,
                name:
                    entry.entry_name ||
                    entry.entry_id
            });
        });
    }

    return result;
}


function uniqueSorted(values) {
    return Array.from(
        new Set(values.filter(Boolean))
    ).sort(
        (a, b) => a.localeCompare(b)
    );
}


function populateFilter(id, values) {
    const select =
        document.getElementById(id);

    select.innerHTML =
        '<option value="">All</option>';

    uniqueSorted(values).forEach(function(value) {
        const option =
            document.createElement('option');

        option.value = value;
        option.textContent = value;

        select.appendChild(option);
    });
}


function filteredSubstrates() {
    const search =
        document
            .getElementById('substrateSearch')
            .value
            .trim()
            .toLowerCase();

    const material =
        document
            .getElementById('materialFilter')
            .value;

    const orientation =
        document
            .getElementById('orientationFilter')
            .value;

    return substrates.filter(function(substrate) {
        return (
            (
                !search ||
                substrate.labId
                    .toLowerCase()
                    .includes(search)
            ) &&
            (
                !material ||
                substrate.material === material
            ) &&
            (
                !orientation ||
                substrate.orientation === orientation
            )
        );
    });
}


function renderSubstrates() {
    const container =
        document.getElementById('substrateResults');

    const visible =
        filteredSubstrates();

    container.innerHTML = '';

    visible.forEach(function(substrate) {
        const row =
            document.createElement('div');

        row.className =
            'result-grid result-row';

        const checkbox =
            document.createElement('input');

        checkbox.type = 'checkbox';
        checkbox.checked = substrate.selected;

        checkbox.addEventListener(
            'change',
            function() {
                substrate.selected =
                    checkbox.checked;
            }
        );

        row.appendChild(checkbox);

        [
            substrate.labId,
            substrate.material || '-',
            substrate.orientation || '-'
        ].forEach(function(value) {
            const cell =
                document.createElement('div');

            cell.textContent = value;
            row.appendChild(cell);
        });

        container.appendChild(row);
    });

    document.getElementById(
        'substrateStatus'
    ).textContent =
        visible.length +
        ' matching substrate' +
        (visible.length === 1 ? '' : 's');
}


function updateRecipeSelect(card) {
    const type =
        card.querySelector('.process-type').value;

    const select =
        card.querySelector('.recipe-select');

    const matching =
        recipes.filter(
            recipe => recipe.type === type
        );

    select.innerHTML = '';

    const placeholder =
        document.createElement('option');

    placeholder.value = '';
    placeholder.textContent =
        matching.length
            ? 'Select recipe...'
            : 'No recipes found';

    select.appendChild(placeholder);

    matching.forEach(function(recipe) {
        const option =
            document.createElement('option');

        option.value = recipe.entryId;
        option.textContent = recipe.name;

        select.appendChild(option);
    });

    select.disabled =
        matching.length === 0;
}


function collapseOthers(active) {
    document
        .querySelectorAll('.process-card')
        .forEach(function(card) {
            if (card !== active) {
                card.classList.remove('open');
            }
        });
}


function renumberProcesses() {
    const cards =
        document.querySelectorAll('.process-card');

    cards.forEach(function(card, index) {
        card.querySelector(
            '.process-title'
        ).textContent =
            'Process ' + (index + 1);
    });

    processCounter = cards.length;
}


function addProcess() {
    processCounter += 1;

    const card =
        document.createElement('div');

    card.className =
        'process-card open';

    collapseOthers(card);

    const options =
        Object.entries(recipeSchemas)
            .map(function([value, definition]) {
                return (
                    '<option value="' +
                    value +
                    '">' +
                    definition.label +
                    '</option>'
                );
            })
            .join('');

    card.innerHTML = `
        <div class="process-summary">
            <div>
                <div class="process-title">
                    Process ${processCounter}
                </div>
                <div class="process-meta">
                    Cleaning
                </div>
            </div>
            <div>⌄</div>
        </div>

        <div class="process-body">
            <div class="process-fields">
                <div>
                    <label>Process type</label>
                    <select class="process-type">
                        ${options}
                    </select>
                </div>

                <div>
                    <label>Date / Time</label>
                    <input
                        class="process-datetime"
                        type="datetime-local"
                    >
                </div>
            </div>

            <label>Recipe</label>
            <select class="recipe-select"></select>

            <label>Comments</label>
            <textarea
                class="process-comments"
                placeholder="Optional"
            ></textarea>

            <div class="process-footer">
                <button
                    class="remove-button"
                    type="button"
                >
                    Remove process
                </button>

                <button
                    class="collapse-button"
                    type="button"
                >
                    Done / collapse
                </button>
            </div>
        </div>
    `;

    document
        .getElementById('processList')
        .appendChild(card);

    const typeSelect =
        card.querySelector('.process-type');

    const meta =
        card.querySelector('.process-meta');

    card
        .querySelector('.process-summary')
        .addEventListener(
            'click',
            function() {
                card.classList.toggle('open');

                if (card.classList.contains('open')) {
                    collapseOthers(card);
                }
            }
        );

    typeSelect.addEventListener(
        'change',
        function() {
            meta.textContent =
                recipeSchemas[
                    typeSelect.value
                ].label;

            updateRecipeSelect(card);
        }
    );

    card
        .querySelector('.collapse-button')
        .addEventListener(
            'click',
            function() {
                card.classList.remove('open');
            }
        );

    card
        .querySelector('.remove-button')
        .addEventListener(
            'click',
            function() {
                card.remove();
                renumberProcesses();
            }
        );

    updateRecipeSelect(card);
}


async function initialise() {
    try {
        document.getElementById(
            'substrateStatus'
        ).textContent =
            'Loading substrates...';

        [substrates, recipes] =
            await Promise.all([
                loadSubstrates(),
                loadRecipes()
            ]);

        populateFilter(
            'materialFilter',
            substrates.map(
                substrate => substrate.material
            )
        );

        populateFilter(
            'orientationFilter',
            substrates.map(
                substrate => substrate.orientation
            )
        );

        renderSubstrates();
        addProcess();

        document.getElementById(
            'processStatus'
        ).textContent =
            recipes.length +
            ' recipe entries loaded from NOMAD.';
    } catch (error) {
        console.error(error);

        document.getElementById(
            'substrateStatus'
        ).textContent =
            'Failed to load NOMAD data.';

        document.getElementById(
            'processStatus'
        ).textContent =
            String(error);
    }
}


document
    .getElementById('substrateSearch')
    .addEventListener(
        'input',
        renderSubstrates
    );

document
    .getElementById('materialFilter')
    .addEventListener(
        'change',
        renderSubstrates
    );

document
    .getElementById('orientationFilter')
    .addEventListener(
        'change',
        renderSubstrates
    );

document
    .getElementById('selectAllButton')
    .addEventListener(
        'click',
        function() {
            filteredSubstrates().forEach(
                substrate => {
                    substrate.selected = true;
                }
            );

            renderSubstrates();
        }
    );

document
    .getElementById('clearSelectionButton')
    .addEventListener(
        'click',
        function() {
            substrates.forEach(
                substrate => {
                    substrate.selected = false;
                }
            );

            renderSubstrates();
        }
    );

document
    .getElementById('addProcessButton')
    .addEventListener(
        'click',
        addProcess
    );

initialise();
