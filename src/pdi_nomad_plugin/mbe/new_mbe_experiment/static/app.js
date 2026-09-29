function nomadApiBase() {
    const marker = '/gui/';
    const pathname = window.location.pathname;
    const index = pathname.indexOf(marker);

    const deploymentBase =
        index >= 0 ? pathname.slice(0, index) : '';

    return deploymentBase + '/api/v1';
}


/*
 * Temporary development holder data.
 *
 * These will be replaced by holder entries loaded
 * dynamically from NOMAD.
 */
const xpsInsertCatalog = [
    {
        id: 'XPS_Insert_1',
        entryId: null
    },
    {
        id: 'XPS_Insert_2',
        entryId: null
    },
    {
        id: 'XPS_Insert_3',
        entryId: null
    }
];


const experimentState = {
    growthRunId: '',
    holder: null,
    positions: {}
};


async function loadTreatmentHistoryEntries() {

    const treatmentSchemas = [
        {
            type: 'cleaning',
            label: 'Cleaning',
            schema:
                'pdi_nomad_plugin.general.schema.CleaningPDI'
        },
        {
            type: 'annealing',
            label: 'Annealing',
            schema:
                'pdi_nomad_plugin.general.schema.AnnealingPDI'
        },
        {
            type: 'etching',
            label: 'Etching',
            schema:
                'pdi_nomad_plugin.general.schema.EtchingPDI'
        },
        {
            type: 'back_side_coating',
            label: 'Back-side coating',
            schema:
                'pdi_nomad_plugin.general.schema.BackSideCoatingPDI'
        }
    ];

    const treatments = [];


    for (const treatmentSchema of treatmentSchemas) {

        const response = await fetch(
            nomadApiBase() + '/entries/query',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: {
                        'section_defs.definition_qualified_name':
                            treatmentSchema.schema
                    },
                    pagination: {
                        page_size: 500
                    },
                    required: {
                        include: [
                            'entry_id',
                            'upload_id',
                            'entry_name',
                            'data'
                        ]
                    }
                })
            }
        );


        if (!response.ok) {
            throw new Error(
                'Treatment history query failed for ' +
                treatmentSchema.type +
                ': ' +
                response.status
            );
        }


        const result =
            await response.json();


        (result.data || []).forEach(
            function(entry) {

                treatments.push({
                    entryId:
                        entry.entry_id,
                    uploadId:
                        entry.upload_id,
                    entryName:
                        entry.entry_name ||
                        entry.entry_id,
                    type:
                        treatmentSchema.type,
                    label:
                        treatmentSchema.label,
                    data:
                        entry.data || {}
                });
            }
        );
    }


    console.log(
        'Treatment history entries:',
        treatments
    );

    return treatments;
}


function treatmentReferencesSubstrate(
    treatment,
    substrateEntryId
) {

    if (
        !treatment ||
        !treatment.data ||
        !substrateEntryId
    ) {
        return false;
    }


    const samples =
        treatment.data.samples || [];


    return samples.some(
        function(sample) {

            if (!sample) {
                return false;
            }


            const reference =
                sample.reference;


            if (!reference) {
                return false;
            }


            if (
                typeof reference ===
                'string'
            ) {
                return reference.includes(
                    substrateEntryId
                );
            }


            if (
                typeof reference ===
                'object'
            ) {

                const serialized =
                    JSON.stringify(
                        reference
                    );

                return serialized.includes(
                    substrateEntryId
                );
            }


            return false;
        }
    );
}



function nomadArchiveReference(
    uploadId,
    entryId
) {

    if (!uploadId || !entryId) {
        throw new Error(
            'uploadId and entryId are required ' +
            'for a NOMAD archive reference.'
        );
    }

    return (
        '../uploads/' +
        uploadId +
        '/archive/' +
        entryId +
        '#data'
    );
}


function treatmentDate(
    treatment
) {

    const data =
        treatment.data || {};

    return (
        data.datetime ||
        data.starting_time ||
        data.start_time ||
        data.ending_time ||
        ''
    );
}


async function loadTreatmentRecipes() {

    const recipeSchemas = [
        {
            type: 'cleaning',
            schema:
                'pdi_nomad_plugin.general.schema.CleaningRecipePDI'
        },
        {
            type: 'annealing',
            schema:
                'pdi_nomad_plugin.general.schema.AnnealingRecipePDI'
        },
        {
            type: 'etching',
            schema:
                'pdi_nomad_plugin.general.schema.EtchingRecipePDI'
        },
        {
            type: 'back_side_coating',
            schema:
                'pdi_nomad_plugin.general.schema.BackSideCoatingRecipePDI'
        }
    ];

    const recipes = [];

    for (const recipeSchema of recipeSchemas) {

        const response = await fetch(
            nomadApiBase() + '/entries/query',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: {
                        'section_defs.definition_qualified_name':
                            recipeSchema.schema
                    },
                    pagination: {
                        page_size: 100
                    },
                    required: {
                        include: [
                            'entry_id',
                            'entry_name'
                        ]
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                'Treatment recipe query failed for ' +
                recipeSchema.type +
                ': ' +
                response.status
            );
        }

        const result =
            await response.json();

        (result.data || []).forEach(
            function(recipe) {

                recipes.push({
                    entryId:
                        recipe.entry_id,
                    name:
                        recipe.entry_name ||
                        recipe.entry_id,
                    type:
                        recipeSchema.type,
                    schema:
                        recipeSchema.schema
                });
            }
        );
    }

    console.log(
        'Treatment recipes:',
        recipes
    );

    return recipes;
}


async function loadSubstrates() {

    const response = await fetch(
        nomadApiBase() + '/entries/query',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: {
                    'section_defs.definition_qualified_name':
                        'pdi_nomad_plugin.mbe.materials.SubstrateMbe'
                },
                pagination: {
                    page_size: 500
                },
                required: {
                    include: [
                        'entry_id',
                        'upload_id',
                        'entry_name',
                        'data.lab_id',
                        'data.parent_sample',
                        'data.material_designation',
                        'data.supplier_id',
                        'data.crystal_id',
                        'data.charge_id',
                        'data.polishing',
                        'data.surface_orientation_label',
                        'data.offcut_label',
                        'data.offcut_direction',
                        'data.as_delivered',
                        'data.processed',
                        'data.grown'
                    ]
                }
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            'Substrate query failed: ' +
            response.status
        );
    }

    const result = await response.json();

    console.log(
        'SubstrateMbe query result:',
        result
    );

    return result.data || [];
}


async function loadHolders() {

    const response = await fetch(
        nomadApiBase() + '/entries/query',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: {
                    'section_defs.definition_qualified_name':
                        'pdi_nomad_plugin.mbe.instrument.SubstrateHolderPDI'
                },
                pagination: {
                    page_size: 100
                },
                required: {
                    include: [
                        'entry_id',
                        'entry_name',
                        'upload_id'
                    ]
                }
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            'Holder query failed: ' +
            response.status
        );
    }

    const result = await response.json();

    console.log(
        'SubstrateHolderPDI query result:',
        result
    );

    return result.data || [];
}


let substrateCatalogState = [];
let splitChildSelectionState = null;
let treatmentHistoryState = [];


function substrateStatus(substrate) {

    if (substrate.grown) {
        return 'grown';
    }

    if (substrate.processed) {
        return 'processed';
    }

    if (substrate.asDelivered) {
        return 'as_delivered';
    }

    return '';
}


function uniqueSorted(values) {

    return Array.from(
        new Set(
            values.filter(Boolean)
        )
    ).sort(
        function(a, b) {
            return a.localeCompare(b);
        }
    );
}


function fillFilterSelect(
    elementId,
    values
) {

    const select =
        document.getElementById(
            elementId
        );

    const previousValue =
        select.value;

    select.innerHTML =
        '<option value="">All</option>';

    uniqueSorted(values).forEach(
        function(value) {

            const option =
                document.createElement(
                    'option'
                );

            option.value = value;
            option.textContent = value;

            select.appendChild(option);
        }
    );

    if (
        Array.from(select.options).some(
            function(option) {
                return (
                    option.value ===
                    previousValue
                );
            }
        )
    ) {
        select.value =
            previousValue;
    }
}


function updateSubstrateFilters() {

    fillFilterSelect(
        'filterMaterial',
        substrateCatalogState.map(
            function(substrate) {
                return substrate.material;
            }
        )
    );

    fillFilterSelect(
        'filterOrientation',
        substrateCatalogState.map(
            function(substrate) {
                return substrate.orientation;
            }
        )
    );

    fillFilterSelect(
        'filterOffcut',
        substrateCatalogState.map(
            function(substrate) {
                return substrate.offcut;
            }
        )
    );

    fillFilterSelect(
        'filterDirection',
        substrateCatalogState.map(
            function(substrate) {
                return substrate.offcutDirection;
            }
        )
    );
}


function filteredSubstrates() {

    const search =
        document.getElementById(
            'substrateSearch'
        ).value
            .trim()
            .toLowerCase();

    const material =
        document.getElementById(
            'filterMaterial'
        ).value;

    const orientation =
        document.getElementById(
            'filterOrientation'
        ).value;

    const offcut =
        document.getElementById(
            'filterOffcut'
        ).value;

    const direction =
        document.getElementById(
            'filterDirection'
        ).value;

    const status =
        document.getElementById(
            'filterStatus'
        ).value;


    return substrateCatalogState.filter(
        function(substrate) {

            const searchable = [
                substrate.labId,
                substrate.entryName,
                substrate.material,
                substrate.supplierId,
                substrate.crystalId,
                substrate.chargeId,
                substrate.orientation,
                substrate.offcut,
                substrate.offcutDirection
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();


            if (
                search &&
                !searchable.includes(search)
            ) {
                return false;
            }

            if (
                material &&
                substrate.material !==
                material
            ) {
                return false;
            }

            if (
                orientation &&
                substrate.orientation !==
                orientation
            ) {
                return false;
            }

            if (
                offcut &&
                substrate.offcut !==
                offcut
            ) {
                return false;
            }

            if (
                direction &&
                substrate.offcutDirection !==
                direction
            ) {
                return false;
            }

            if (
                status &&
                substrateStatus(
                    substrate
                ) !== status
            ) {
                return false;
            }

            return true;
        }
    );
}


function selectSubstrate(
    substrate
) {

    const position =
        getActivePosition();

    if (
        !position ||
        position.position_usage !==
        'substrate'
    ) {
        return;
    }


    const oldEntryId =
        position.substrate
            ? position.substrate.entryId
            : null;


    /*
     * Treatments already queued for another
     * substrate must not follow a replacement
     * substrate accidentally.
     */
    if (
        oldEntryId &&
        oldEntryId !== substrate.entryId
    ) {
        position.pendingTreatments = [];
    }


    position.substrate = {
        entryId:
            substrate.entryId,
        uploadId:
            substrate.uploadId,
        entryName:
            substrate.entryName,
        labId:
            substrate.labId,
        parentSample:
            substrate.parentSample,
        material:
            substrate.material,
        supplierId:
            substrate.supplierId,
        crystalId:
            substrate.crystalId,
        chargeId:
            substrate.chargeId,
        polishing:
            substrate.polishing,
        orientation:
            substrate.orientation,
        offcut:
            substrate.offcut,
        offcutDirection:
            substrate.offcutDirection,
        asDelivered:
            substrate.asDelivered,
        processed:
            substrate.processed,
        grown:
            substrate.grown
    };


    renderHolder();
    renderSubstrateResults();
    renderTreatmentQueue();
    updateStatePreview();
}


function renderSubstrateResults() {

    const container =
        document.getElementById(
            'substrateResults'
        );

    container.innerHTML = '';


    const position =
        getActivePosition();

    if (
        !position ||
        position.position_usage !==
        'substrate'
    ) {

        const message =
            document.createElement('p');

        message.className = 'small';

        message.style.padding = '10px';

        message.textContent =
            'Select a substrate holder position first.';

        container.appendChild(
            message
        );

        return;
    }


    const substrates =
        filteredSubstrates();


    if (substrates.length === 0) {

        const message =
            document.createElement('p');

        message.className = 'small';

        message.style.padding = '10px';

        message.textContent =
            'No matching substrates found.';

        container.appendChild(
            message
        );

        return;
    }


    substrates.forEach(
        function(substrate) {

            const row =
                document.createElement(
                    'div'
                );

            row.className =
                'substrate-result';


            if (
                position.substrate &&
                position.substrate.entryId ===
                substrate.entryId
            ) {
                row.style.background =
                    '#eef4fb';
            }


            const title =
                document.createElement(
                    'div'
                );

            title.style.fontWeight =
                'bold';

            title.textContent =
                substrate.labId ||
                substrate.entryName ||
                substrate.entryId;

            row.appendChild(title);


            const details =
                document.createElement(
                    'div'
                );

            details.className =
                'small';

            const parts = [
                substrate.material,
                substrate.orientation,
                substrate.offcut,
                substrate.offcutDirection,
                substrateStatus(
                    substrate
                )
            ].filter(Boolean);

            details.textContent =
                parts.join(' | ');

            row.appendChild(details);


            row.addEventListener(
                'click',
                function() {
                    selectSubstrate(
                        substrate
                    );
                }
            );


            container.appendChild(
                row
            );
        }
    );
}


async function initialiseSubstrates() {

    const container =
        document.getElementById(
            'substrateResults'
        );

    container.innerHTML =
        '<p class="small" style="padding:10px;">' +
        'Loading substrates...' +
        '</p>';


    try {

        const entries =
            await loadSubstrates();


        substrateCatalogState =
            entries.map(
                function(entry) {

                    const data =
                        entry.data || {};

                    return {
                        entryId:
                            entry.entry_id,
                        uploadId:
                            entry.upload_id,
                        entryName:
                            entry.entry_name ||
                            entry.entry_id,
                        labId:
                            data.lab_id ||
                            entry.entry_name ||
                            entry.entry_id,

                        parentSample:

                            data.parent_sample || null,
                        material:
                            data.material_designation ||
                            '',
                        supplierId:
                            data.supplier_id ||
                            '',
                        crystalId:
                            data.crystal_id ||
                            '',
                        chargeId:
                            data.charge_id ||
                            '',
                        polishing:
                            data.polishing ||
                            '',
                        orientation:
                            data.surface_orientation_label ||
                            '',
                        offcut:
                            data.offcut_label ||
                            '',
                        offcutDirection:
                            data.offcut_direction ||
                            '',
                        asDelivered:
                            Boolean(
                                data.as_delivered
                            ),
                        processed:
                            Boolean(
                                data.processed
                            ),
                        grown:
                            Boolean(
                                data.grown
                            )
                    };
                }
            );


        updateSubstrateFilters();
        renderSubstrateResults();
        renderSplitChildResults();

    } catch (error) {

        console.error(error);

        container.innerHTML =
            '<p class="small" style="padding:10px;">' +
            'Could not load substrates.' +
            '</p>';
    }
}


function initialiseSubstrateFilterEvents() {

    document.getElementById(
        'substrateSearch'
    ).addEventListener(
        'input',
        renderSubstrateResults
    );


    [
        'filterMaterial',
        'filterOrientation',
        'filterOffcut',
        'filterDirection',
        'filterStatus'
    ].forEach(
        function(elementId) {

            document.getElementById(
                elementId
            ).addEventListener(
                'change',
                renderSubstrateResults
            );
        }
    );
}


function treatmentProcessSchema(type) {

    const schemas = {
        cleaning:
            'pdi_nomad_plugin.general.schema.CleaningPDI',
        annealing:
            'pdi_nomad_plugin.general.schema.AnnealingPDI',
        etching:
            'pdi_nomad_plugin.general.schema.EtchingPDI',
        back_side_coating:
            'pdi_nomad_plugin.general.schema.BackSideCoatingPDI'
    };

    return schemas[type] || null;
}


function safeTreatmentPart(value) {

    return String(value || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9._-]/g, '');
}


function treatmentArchiveData(
    substrate,
    treatment
) {

    const processSchema =
        treatmentProcessSchema(
            treatment.type
        );

    if (!processSchema) {
        throw new Error(
            'Unsupported treatment type: ' +
            treatment.type
        );
    }

    if (
        !substrate.uploadId ||
        !substrate.entryId
    ) {
        throw new Error(
            'Selected substrate has no complete ' +
            'NOMAD reference.'
        );
    }

    if (
        !treatment.recipeUploadId ||
        !treatment.entryId
    ) {
        throw new Error(
            'Treatment recipe has no complete ' +
            'NOMAD reference: ' +
            treatment.name
        );
    }


    let datetime;

    if (treatment.datetime) {
        datetime =
            new Date(
                treatment.datetime
            ).toISOString();
    } else {
        datetime =
            new Date().toISOString();
    }


    const data = {
        m_def:
            processSchema,

        name:
            (
                substrate.labId ||
                substrate.entryName ||
                substrate.entryId
            ) +
            ' - ' +
            treatment.name,

        datetime:
            datetime,

        samples: [
            {
                name:
                    substrate.labId ||
                    substrate.entryName ||
                    substrate.entryId,

                reference:
                    nomadArchiveReference(
                        substrate.uploadId,
                        substrate.entryId
                    )
            }
        ],

        recipe:
            nomadArchiveReference(
                treatment.recipeUploadId,
                treatment.entryId
            )
    };


    if (treatment.notes) {
        data.description =
            treatment.notes;
    }


    return data;
}


function treatmentFilename(
    substrate,
    treatment,
    index
) {

    const substrateName =
        safeTreatmentPart(
            substrate.labId ||
            substrate.entryName ||
            substrate.entryId
        );

    const type =
        safeTreatmentPart(
            treatment.type
        );

    const time =
        new Date()
            .toISOString()
            .replace(/[-:TZ.]/g, '')
            .slice(0, 14);


    return (
        substrateName +
        '_' +
        type +
        '_' +
        time +
        '_' +
        String(index + 1) +
        '.archive.yaml'
    );
}


async function uploadTreatmentArchive(
    uploadId,
    filename,
    data
) {

    const params =
        new URLSearchParams();

    params.append(
        'file_name',
        filename
    );

    params.append(
        'overwrite_if_exists',
        'false'
    );

    params.append(
        'trigger_processing',
        'true'
    );


    const response =
        await fetch(
            nomadApiBase() +
            '/uploads/' +
            encodeURIComponent(
                uploadId
            ) +
            '/raw/?' +
            params.toString(),
            {
                method: 'PUT',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body: JSON.stringify(
                    {
                        data: data
                    },
                    null,
                    2
                )
            }
        );


    if (!response.ok) {

        let detail = '';

        try {

            const errorData =
                await response.json();

            if (errorData.detail) {
                detail =
                    ': ' +
                    errorData.detail;
            }

        } catch (_) {
        }


        throw new Error(
            'Treatment upload failed (' +
            response.status +
            ')' +
            detail
        );
    }
}


async function savePendingTreatments() {

    const position =
        getActivePosition();

    const status =
        document.getElementById(
            'treatmentSaveStatus'
        );

    const button =
        document.getElementById(
            'saveTreatmentsButton'
        );


    if (
        !position ||
        position.position_usage !==
        'substrate' ||
        !position.substrate
    ) {
        status.textContent =
            'Select a substrate first.';
        return;
    }


    const treatments =
        position.pendingTreatments || [];


    if (treatments.length === 0) {
        status.textContent =
            'No pending treatments to save.';
        return;
    }


    const substrate =
        position.substrate;

    const uploadId =
        document.getElementById(
            'targetUpload'
        ).value;


    if (!uploadId) {
        status.textContent =
            'Select a target upload first.';
        return;
    }


    button.disabled = true;

    const savedTreatments = [];


    try {

        for (
            let index = 0;
            index < treatments.length;
            index++
        ) {

            const treatment =
                treatments[index];

            status.textContent =
                'Saving treatment ' +
                String(index + 1) +
                ' of ' +
                String(treatments.length) +
                ': ' +
                treatment.name +
                '...';


            const data =
                treatmentArchiveData(
                    substrate,
                    treatment
                );

            const filename =
                treatmentFilename(
                    substrate,
                    treatment,
                    index
                );


            await uploadTreatmentArchive(
                uploadId,
                filename,
                data
            );


            savedTreatments.push(
                treatment
            );
        }


        position.pendingTreatments =
            treatments.filter(
                function(treatment) {
                    return (
                        !savedTreatments.includes(
                            treatment
                        )
                    );
                }
            );


        renderTreatmentQueue();
        updateStatePreview();


        status.textContent =
            String(savedTreatments.length) +
            ' treatment(s) saved. ' +
            'NOMAD processing was triggered.';


        /*
         * Reload the history query. Depending on NOMAD
         * processing time, newly written entries may not
         * be indexed immediately.
         */
        try {

            treatmentHistoryState =
                await loadTreatmentHistoryEntries();

            renderTreatmentHistory();

        } catch (historyError) {

            console.warn(
                'Treatment history refresh failed:',
                historyError
            );
        }

    } catch (error) {

        /*
         * Keep treatments that were not saved.
         * Treatments already uploaded are removed from
         * the pending queue to avoid duplicate writes.
         */
        position.pendingTreatments =
            treatments.filter(
                function(treatment) {
                    return (
                        !savedTreatments.includes(
                            treatment
                        )
                    );
                }
            );

        renderTreatmentQueue();
        updateStatePreview();

        status.textContent =
            'Error after saving ' +
            String(savedTreatments.length) +
            ' treatment(s): ' +
            error.message;

    } finally {

        button.disabled =
            false;
    }
}


function initialiseTreatmentSaveControls() {

    if (
        document.getElementById(
            'saveTreatmentsButton'
        )
    ) {
        return;
    }


    const editor =
        document.querySelector(
            '.treatment-editor'
        );

    if (!editor) {
        console.warn(
            'Treatment editor not found.'
        );
        return;
    }


    const button =
        document.createElement(
            'button'
        );

    button.id =
        'saveTreatmentsButton';

    button.type =
        'button';

    button.className =
        'primary';

    button.style.marginTop =
        '12px';

    button.style.width =
        '100%';

    button.textContent =
        'Save treatments to NOMAD';

    button.addEventListener(
        'click',
        savePendingTreatments
    );


    const status =
        document.createElement(
            'p'
        );

    status.id =
        'treatmentSaveStatus';

    status.className =
        'small';

    status.textContent =
        'Treatments will be saved to the ' +
        'selected target upload.';


    editor.appendChild(
        button
    );

    editor.appendChild(
        status
    );
}


async function initialiseTreatmentRecipes() {

    const select =
        document.getElementById(
            'treatmentRecipeSelect'
        );

    const button =
        document.getElementById(
            'addTreatmentButton'
        );

    select.innerHTML =
        '<option value="">Loading treatment recipes...</option>';

    button.disabled = true;

    try {

        const recipes =
            await loadTreatmentRecipes();

        select.innerHTML =
            '<option value="">Select treatment recipe...</option>';


        const groups = {
            cleaning: 'Cleaning',
            annealing: 'Annealing',
            etching: 'Etching',
            back_side_coating:
                'Back-side coating'
        };


        Object.keys(groups).forEach(
            function(type) {

                const recipesOfType =
                    recipes.filter(
                        function(recipe) {
                            return (
                                recipe.type ===
                                type
                            );
                        }
                    );

                if (
                    recipesOfType.length === 0
                ) {
                    return;
                }


                const group =
                    document.createElement(
                        'optgroup'
                    );

                group.label =
                    groups[type];


                recipesOfType.forEach(
                    function(recipe) {

                        const option =
                            document.createElement(
                                'option'
                            );

                        option.value =
                            recipe.entryId;

                        option.textContent =
                            recipe.name;

                        option.dataset.recipeType =
                            recipe.type;

                        option.dataset.recipeSchema =
                            recipe.schema;
                        option.dataset.recipeUploadId =
                            recipe.uploadId || '';

                        group.appendChild(
                            option
                        );
                    }
                );


                select.appendChild(
                    group
                );
            }
        );


        select.addEventListener(
            'change',
            function() {

                button.disabled =
                    !select.value;
            }
        );


        button.addEventListener(
            'click',
            addTreatmentToQueue
        );

    } catch (error) {

        console.error(error);

        select.innerHTML =
            '<option value="">Could not load treatment recipes</option>';

        button.disabled = true;
    }
}


async function loadUploads() {

    const select =
        document.getElementById(
            'targetUpload'
        );

    const status =
        document.getElementById(
            'uploadStatus'
        );

    select.innerHTML =
        '<option value="">' +
        'Loading uploads...' +
        '</option>';

    status.textContent =
        'Loading writable NOMAD uploads...';


    const params =
        new URLSearchParams();

    params.append(
        'roles',
        'main_author'
    );

    params.append(
        'roles',
        'coauthor'
    );

    params.append(
        'page_size',
        '100'
    );


    try {

        const response =
            await fetch(
                nomadApiBase() +
                '/uploads?' +
                params.toString()
            );

        if (!response.ok) {
            throw new Error(
                'Upload request failed: ' +
                response.status
            );
        }


        const result =
            await response.json();

        const uploads =
            (result.data || []).filter(
                function(upload) {
                    return !upload.published;
                }
            );


        select.innerHTML =
            '<option value="">' +
            'Select target upload...' +
            '</option>';


        uploads.forEach(
            function(upload) {

                const option =
                    document.createElement(
                        'option'
                    );

                option.value =
                    upload.upload_id;

                const name =
                    upload.upload_name ||
                    'Unnamed upload';

                const entries =
                    upload.entries !== undefined
                        ? upload.entries
                        : '?';

                option.textContent =
                    name +
                    ' ? ' +
                    upload.upload_id +
                    ' (' +
                    entries +
                    ' entries)';

                select.appendChild(
                    option
                );
            }
        );


        status.textContent =
            String(uploads.length) +
            ' writable unpublished upload(s) ' +
            'available.';

    } catch (error) {

        select.innerHTML =
            '<option value="">' +
            'Could not load uploads' +
            '</option>';

        status.textContent =
            'Error: ' +
            error.message;
    }
}


async function initialiseHolderSelect() {

    const select =
        document.getElementById('holderSelect');

    select.innerHTML =
        '<option value="">Loading holders...</option>';

    try {

        const holders =
            await loadHolders();

        select.innerHTML =
            '<option value="">Select holder...</option>';

        holders.forEach(function(holder) {

            const option =
                document.createElement('option');

            option.value =
                holder.entry_id;

            option.dataset.uploadId =
                holder.upload_id || '';

            option.textContent =
                holder.entry_name ||
                holder.entry_id;

            option.dataset.holderName =
                holder.entry_name ||
                holder.entry_id;

            select.appendChild(option);
        });

    } catch (error) {

        console.error(error);

        select.innerHTML =
            '<option value="">Could not load holders</option>';
    }
}


function getActivePosition() {

    if (
        !experimentState.activePositionName
    ) {
        return null;
    }

    return experimentState.positions[
        experimentState.activePositionName
    ] || null;
}


function substrateSplitGeometry(
    widthMm,
    lengthMm,
    thicknessMm
) {

    const width =
        Number(widthMm);

    const length =
        Number(lengthMm);

    const thickness =
        Number(thicknessMm);


    if (
        !Number.isFinite(width) ||
        !Number.isFinite(length) ||
        !Number.isFinite(thickness) ||
        width <= 0 ||
        length <= 0 ||
        thickness <= 0
    ) {
        throw new Error(
            'Child width, length and thickness ' +
            'must all be positive numbers.'
        );
    }


    const widthM =
        width / 1000;

    const lengthM =
        length / 1000;

    const thicknessM =
        thickness / 1000;


    if (
        Math.abs(
            width - length
        ) < 1e-9
    ) {
        return {
            m_def:
                'nomad_material_processing.general.' +
                'SquareCuboid',
            width:
                widthM,
            height:
                thicknessM
        };
    }


    return {
        m_def:
            'nomad_material_processing.general.' +
            'RectangleCuboid',
        width:
            widthM,
        length:
            lengthM,
        height:
            thicknessM
    };
}


function setDefaultSplitDateTime() {

    const input =
        document.getElementById(
            'splitDateTime'
        );

    if (
        !input ||
        input.value
    ) {
        return;
    }


    const now =
        new Date();

    const local =
        new Date(
            now.getTime() -
            now.getTimezoneOffset() *
            60000
        )
            .toISOString()
            .slice(0, 16);

    input.value =
        local;
}


function predictedChildLabIds(
    substrate,
    count
) {

    const parentId =
        substrate.labId ||
        substrate.entryName ||
        substrate.entryId;

    const result = [];

    for (
        let index = 1;
        index <= count;
        index += 1
    ) {
        result.push(
            parentId +
            '.' +
            String(index)
        );
    }

    return result;
}


function expectedSplitChildIds() {

    if (!splitChildSelectionState) {
        return [];
    }

    const ids = [];

    for (
        let index = 1;
        index <= splitChildSelectionState.count;
        index += 1
    ) {
        ids.push(
            splitChildSelectionState.parentLabId +
            '.' +
            String(index)
        );
    }

    return ids;
}


function splitChildSubstrates() {

    const expectedIds =
        expectedSplitChildIds();

    if (expectedIds.length === 0) {
        return [];
    }

    return substrateCatalogState
        .filter(
            function(substrate) {
                return expectedIds.includes(
                    substrate.labId
                );
            }
        )
        .sort(
            function(a, b) {
                return String(a.labId).localeCompare(
                    String(b.labId),
                    undefined,
                    {
                        numeric: true
                    }
                );
            }
        );
}


function renderSplitChildResults() {

    const picker =
        document.getElementById(
            'splitChildPicker'
        );

    const container =
        document.getElementById(
            'splitChildResults'
        );

    if (
        !picker ||
        !container
    ) {
        return;
    }


    container.innerHTML = '';


    if (!splitChildSelectionState) {

        picker.style.display =
            'none';

        return;
    }


    picker.style.display =
        'block';


    const expectedIds =
        expectedSplitChildIds();

    const children =
        splitChildSubstrates();


    if (children.length === 0) {

        const message =
            document.createElement('p');

        message.className =
            'small';

        message.textContent =
            'No child substrates are indexed yet. ' +
            'Expected: ' +
            expectedIds.join(', ') +
            '. Use Refresh child substrates.';

        container.appendChild(
            message
        );

        return;
    }


    children.forEach(
        function(substrate) {

            const row =
                document.createElement(
                    'div'
                );

            row.className =
                'substrate-result';


            const title =
                document.createElement(
                    'div'
                );

            title.style.fontWeight =
                'bold';

            title.textContent =
                substrate.labId;

            row.appendChild(
                title
            );


            const details =
                document.createElement(
                    'div'
                );

            details.className =
                'small';

            const parts = [
                substrate.material,
                substrate.orientation,
                substrate.offcut,
                substrate.offcutDirection,
                substrateStatus(
                    substrate
                )
            ].filter(Boolean);

            details.textContent =
                parts.join(' | ');

            row.appendChild(
                details
            );


            const button =
                document.createElement(
                    'button'
                );

            button.type =
                'button';

            button.className =
                'secondary';

            button.style.marginTop =
                '8px';

            button.textContent =
                'Use ' +
                substrate.labId +
                ' in holder';


            button.addEventListener(
                'click',
                function(event) {

                    event.stopPropagation();

                    selectSubstrate(
                        substrate
                    );

                    const status =
                        document.getElementById(
                            'splitSubstrateStatus'
                        );

                    status.textContent =
                        substrate.labId +
                        ' selected for the active ' +
                        'holder position.';
                }
            );


            row.appendChild(
                button
            );

            container.appendChild(
                row
            );
        }
    );


    if (
        children.length <
        expectedIds.length
    ) {

        const pending =
            expectedIds.filter(
                function(id) {
                    return !children.some(
                        function(child) {
                            return (
                                child.labId === id
                            );
                        }
                    );
                }
            );

        const message =
            document.createElement('p');

        message.className =
            'small';

        message.textContent =
            'Still waiting for: ' +
            pending.join(', ');

        container.appendChild(
            message
        );
    }
}


async function refreshSplitChildren() {

    const button =
        document.getElementById(
            'refreshSplitChildrenButton'
        );

    const status =
        document.getElementById(
            'splitSubstrateStatus'
        );


    if (!splitChildSelectionState) {

        status.textContent =
            'No substrate cut has been created yet.';

        return;
    }


    button.disabled =
        true;

    status.textContent =
        'Refreshing child substrates...';


    try {

        await initialiseSubstrates();

        renderSplitChildResults();


        const children =
            splitChildSubstrates();

        const expected =
            expectedSplitChildIds();


        if (
            children.length ===
            expected.length
        ) {

            status.textContent =
                'All child substrates are available.';

        } else {

            status.textContent =
                String(children.length) +
                ' of ' +
                String(expected.length) +
                ' child substrates are available.';
        }

    } catch (error) {

        status.textContent =
            'Error refreshing child substrates: ' +
            error.message;

    } finally {

        button.disabled =
            false;
    }
}


async function saveSubstrateSplit() {

    const status =
        document.getElementById(
            'splitSubstrateStatus'
        );

    const button =
        document.getElementById(
            'splitSubstrateButton'
        );

    const position =
        getActivePosition();


    if (
        !position ||
        !position.substrate
    ) {
        status.textContent =
            'Select a substrate first.';
        return;
    }


    const substrate =
        position.substrate;


    if (
        !substrate.uploadId ||
        !substrate.entryId
    ) {
        status.textContent =
            'Selected substrate has no complete NOMAD reference.';
        return;
    }


    const uploadId =
        document.getElementById(
            'targetUpload'
        ).value;


    if (!uploadId) {
        status.textContent =
            'Select a target upload first.';
        return;
    }


    const count =
        Number(
            document.getElementById(
                'splitCount'
            ).value
        );


    if (
        !Number.isInteger(count) ||
        count < 2
    ) {
        status.textContent =
            'Number of child substrates must be at least 2.';
        return;
    }


    let geometry;

    try {

        geometry =
            substrateSplitGeometry(
                document.getElementById(
                    'splitWidth'
                ).value,
                document.getElementById(
                    'splitLength'
                ).value,
                document.getElementById(
                    'splitThickness'
                ).value
            );

    } catch (error) {

        status.textContent =
            'Error: ' +
            error.message;

        return;
    }


    const datetimeInput =
        document.getElementById(
            'splitDateTime'
        ).value;

    const notes =
        document.getElementById(
            'splitNotes'
        ).value.trim();


    let datetime =
        new Date().toISOString();

    if (datetimeInput) {
        datetime =
            new Date(
                datetimeInput
            ).toISOString();
    }


    const parentName =
        substrate.labId ||
        substrate.entryName ||
        substrate.entryId;


    const data = {
        m_def:
            'pdi_nomad_plugin.general.schema.' +
            'SampleCutPDI',

        name:
            parentName +
            ' - substrate cut',

        datetime:
            datetime,

        number_of_samples:
            count,

        parent_sample: {
            name:
                parentName,

            reference:
                nomadArchiveReference(
                    substrate.uploadId,
                    substrate.entryId
                )
        },

        children_geometry:
            geometry,

        trigger_cut_sample:
            true
    };


    if (notes) {
        data.description =
            notes;
    }


    const timestamp =
        datetime
            .replace(
                /[:.]/g,
                '-'
            );

    const filename =
        experimentSafePart(
            parentName
        ) +
        '.SampleCut.' +
        timestamp +
        '.archive.yaml';


    button.disabled =
        true;

    status.textContent =
        'Saving substrate cut...';


    try {

        await uploadArchiveData(
            uploadId,
            filename,
            data
        );


        const childIds =
            predictedChildLabIds(
                substrate,
                count
            );


        splitChildSelectionState = {
            parentLabId:
                parentName,
            count:
                count
        };


        status.textContent =
            'Cut saved. Expected child substrates: ' +
            childIds.join(', ') +
            '. NOMAD processing was triggered.';


        /*
         * Reload the substrate catalogue.
         * New child entries may not be indexed immediately,
         * so they may appear only after a later refresh.
         */
        try {

            await initialiseSubstrates();

            renderSubstrateResults();
            renderSplitChildResults();

        } catch (refreshError) {

            console.warn(
                'Substrate catalogue refresh failed:',
                refreshError
            );
        }

    } catch (error) {

        status.textContent =
            'Error: ' +
            error.message;

    } finally {

        button.disabled =
            false;
    }
}


function referenceEntryId(reference) {

    if (!reference) {
        return null;
    }


    if (
        typeof reference === 'object' &&
        reference.reference
    ) {
        return referenceEntryId(
            reference.reference
        );
    }


    if (typeof reference !== 'string') {
        return null;
    }


    const match =
        reference.match(
            new RegExp(
                '/archive/([^/#]+)'
            )
        );

    return match
        ? match[1]
        : null;
}


function substrateByEntryId(entryId) {

    if (!entryId) {
        return null;
    }

    return (
        substrateCatalogState.find(
            function(substrate) {
                return (
                    substrate.entryId ===
                    entryId
                );
            }
        ) || null
    );
}


function substrateLineage(substrate) {

    const lineage = [];
    const seen = new Set();

    let current =
        substrate;

    while (
        current &&
        current.entryId &&
        !seen.has(
            current.entryId
        )
    ) {

        seen.add(
            current.entryId
        );

        lineage.push(
            current
        );


        const parentEntryId =
            referenceEntryId(
                current.parentSample
            );

        if (!parentEntryId) {
            break;
        }

        current =
            substrateByEntryId(
                parentEntryId
            );
    }


    return lineage;
}


function treatmentHistoryForSubstrate(
    substrate
) {

    const lineage =
        substrateLineage(
            substrate
        );

    const rows = [];


    lineage.forEach(
        function(lineageSubstrate, index) {

            treatmentHistoryState.forEach(
                function(treatment) {

                    if (
                        treatmentReferencesSubstrate(
                            treatment,
                            lineageSubstrate.entryId
                        )
                    ) {

                        rows.push({
                            treatment:
                                treatment,

                            substrate:
                                lineageSubstrate,

                            inherited:
                                index > 0
                        });
                    }
                }
            );
        }
    );


    rows.sort(
        function(a, b) {

            const dateA =
                treatmentDate(
                    a.treatment
                );

            const dateB =
                treatmentDate(
                    b.treatment
                );

            return String(
                dateA
            ).localeCompare(
                String(dateB)
            );
        }
    );


    return rows;
}


function renderTreatmentHistory() {

    const container =
        document.getElementById(
            'treatmentHistory'
        );

    container.innerHTML = '';

    const position =
        getActivePosition();


    if (
        !position ||
        !position.substrate
    ) {

        const empty =
            document.createElement(
                'p'
            );

        empty.className =
            'small';

        empty.textContent =
            'Select a substrate to view its history.';

        container.appendChild(
            empty
        );

        return;
    }


    const substrate =
        position.substrate;

    const lineage =
        substrateLineage(
            substrate
        );

    const history =
        treatmentHistoryForSubstrate(
            substrate
        );


    if (lineage.length > 1) {

        const lineageInfo =
            document.createElement(
                'p'
            );

        lineageInfo.className =
            'small';

        lineageInfo.textContent =
            'Substrate lineage: ' +
            lineage
                .slice()
                .reverse()
                .map(
                    function(item) {
                        return (
                            item.labId ||
                            item.entryName ||
                            item.entryId
                        );
                    }
                )
                .join(' ? ');

        container.appendChild(
            lineageInfo
        );
    }


    if (history.length === 0) {

        const empty =
            document.createElement(
                'p'
            );

        empty.className =
            'small';

        empty.textContent =
            'No treatment history found.';

        container.appendChild(
            empty
        );

        return;
    }


    history.forEach(
        function(row) {

            const treatment =
                row.treatment;

            const item =
                document.createElement(
                    'div'
                );

            item.className =
                'treatment-history-item';


            const title =
                document.createElement(
                    'div'
                );

            title.textContent =
                treatment.label +
                ': ' +
                treatment.entryName;

            item.appendChild(
                title
            );


            if (row.inherited) {

                const inherited =
                    document.createElement(
                        'div'
                    );

                inherited.className =
                    'small';

                inherited.textContent =
                    'Inherited from ' +
                    (
                        row.substrate.labId ||
                        row.substrate.entryName ||
                        row.substrate.entryId
                    );

                item.appendChild(
                    inherited
                );
            }


            const date =
                treatmentDate(
                    treatment
                );

            if (date) {

                const dateElement =
                    document.createElement(
                        'div'
                    );

                dateElement.className =
                    'treatment-history-date';

                dateElement.textContent =
                    date;

                item.appendChild(
                    dateElement
                );
            }


            container.appendChild(
                item
            );
        }
    );
}


async function initialiseTreatmentHistory() {

    try {

        treatmentHistoryState =
            await loadTreatmentHistoryEntries();

        renderTreatmentHistory();

    } catch (error) {

        console.error(error);

        const container =
            document.getElementById(
                'treatmentHistory'
            );

        container.innerHTML =
            '<p class="small">' +
            'Could not load treatment history.' +
            '</p>';
    }
}


function renderTreatmentQueue() {

    const container =
        document.getElementById(
            'treatmentQueue'
        );

    container.innerHTML = '';

    const position =
        getActivePosition();


    if (!position) {

        const empty =
            document.createElement('p');

        empty.className = 'small';

        empty.textContent =
            'Select a substrate position first.';

        container.appendChild(empty);

        return;
    }


    const treatments =
        position.pendingTreatments || [];


    if (treatments.length === 0) {

        const empty =
            document.createElement('p');

        empty.className = 'small';

        empty.textContent =
            'No treatments selected for position ' +
            experimentState.activePositionName +
            '.';

        container.appendChild(empty);

        return;
    }


    treatments.forEach(
        function(item, index) {

            const row =
                document.createElement('div');

            row.className =
                'treatment-queue-item';


            const text =
                document.createElement('span');

            text.textContent =
                item.name +
                ' (' +
                item.type +
                ')' +
                (
                    item.datetime
                        ? ' | ' + item.datetime
                        : ''
                );

            row.appendChild(text);


            const removeButton =
                document.createElement(
                    'button'
                );

            removeButton.type =
                'button';

            removeButton.className =
                'secondary';

            removeButton.textContent =
                'Remove';

            removeButton.addEventListener(
                'click',
                function() {

                    treatments.splice(
                        index,
                        1
                    );

                    renderTreatmentQueue();
                    updateStatePreview();
                }
            );


            row.appendChild(
                removeButton
            );

            container.appendChild(row);
        }
    );
}


function setDefaultTreatmentDateTime() {

    const input =
        document.getElementById(
            'treatmentDateTime'
        );

    if (!input || input.value) {
        return;
    }

    const now = new Date();

    const local =
        new Date(
            now.getTime() -
            now.getTimezoneOffset() * 60000
        )
            .toISOString()
            .slice(0, 16);

    input.value = local;
}


function addTreatmentToQueue() {

    const position =
        getActivePosition();

    if (
        !position ||
        position.position_usage !==
        'substrate'
    ) {
        return;
    }


    const select =
        document.getElementById(
            'treatmentRecipeSelect'
        );

    if (!select.value) {
        return;
    }


    const option =
        select.options[
            select.selectedIndex
        ];


    const treatmentDateTime =
        document.getElementById(
            'treatmentDateTime'
        ).value;

    const treatmentNotes =
        document.getElementById(
            'treatmentNotes'
        ).value.trim();


    if (!position.pendingTreatments) {
        position.pendingTreatments = [];
    }


    const exists =
        position.pendingTreatments.some(
            function(item) {
                return (
                    item.entryId ===
                    select.value
                );
            }
        );


    if (!exists) {

        position.pendingTreatments.push({
            entryId:
                select.value,
            name:
                option.textContent,
            type:
                option.dataset.recipeType,
            schema:
                option.dataset.recipeSchema,
            recipeUploadId:
                option.dataset.recipeUploadId,
            datetime:
                treatmentDateTime || null,
            notes:
                treatmentNotes || null
        });
    }


    select.value = '';


    document.getElementById(
        'treatmentDateTime'
    ).value = '';

    document.getElementById(
        'treatmentNotes'
    ).value = '';

    document.getElementById(
        'addTreatmentButton'
    ).disabled = true;


    renderTreatmentQueue();
    updateStatePreview();
}


function updateGrowthRunId() {

    experimentState.growthRunId =
        document
            .getElementById('growthRunId')
            .value
            .trim();

    updateCombinedId();
    updateStatePreview();
}


function selectHolder() {

    const select =
        document.getElementById('holderSelect');

    const holderEntryId =
        select.value;

    if (!holderEntryId) {

        experimentState.holder = null;
        experimentState.positions = {};

        document.getElementById(
            'holderLabel'
        ).textContent =
            'No holder selected';

        document.getElementById(
            'holderGrid'
        ).innerHTML = '';

        updateCombinedId();
        updateStatePreview();

        return;
    }


    const selectedOption =
        select.options[
            select.selectedIndex
        ];

    const holderName =
        selectedOption.dataset.holderName ||
        selectedOption.textContent ||
        holderEntryId;


    let layoutType = null;


    if (holderName.includes('XPS')) {

        layoutType = 'xps_insert';

    } else if (
        holderName.endsWith('_10')
    ) {

        layoutType =
            'five_10mm_slots';

    } else if (
        holderName.endsWith('_2')
    ) {

        layoutType =
            'two_inch_wafer';

    } else if (
        holderName.endsWith('_1/4') ||
        holderName.endsWith('_1_4')
    ) {

        layoutType =
            'quarter_two_inch_wafer';
    }


    experimentState.holder = {
        id: holderName,
        entryId: holderEntryId,
        uploadId:
            selectedOption.dataset.uploadId,
        layoutType: layoutType,
        xpsInsert: null
    };


    experimentState.positions = {};


    positionsForLayout(
        layoutType
    ).forEach(
        function(positionName) {

            experimentState.positions[
                positionName
            ] = {
                position_usage: null,
                substrate: null
            };
        }
    );


    document.getElementById(
        'holderLabel'
    ).textContent =
        holderName;


    renderHolder();
    updateCombinedId();
    updateStatePreview();
}


function renderHolder() {

    const grid =
        document.getElementById(
            'holderGrid'
        );

    grid.innerHTML = '';

    if (!experimentState.holder) {
        return;
    }


    /*
     * 3-inch holders ending in "_10":
     *
     *          E
     *
     *     D    A    B
     *
     *          C
     *
     * Each square represents a 10 x 10 mm slot.
     */
    if (
        experimentState.holder.layoutType ===
        'five_10mm_slots'
    ) {

        const disc =
            document.createElement('div');

        disc.className = 'holder-disc';


        ['A', 'B', 'C', 'D', 'E'].forEach(
            function(positionName) {

                const position =
                    experimentState.positions[
                        positionName
                    ];

                const slot =
                    document.createElement('div');

                slot.className =
                    'holder-slot pos-' +
                    positionName;

                if (position.position_usage) {
                    slot.classList.add('active');
                }

                if (
                    position.position_usage ===
                    'si_dummy'
                ) {
                    slot.classList.add(
                        'si-dummy'
                    );
                }


                const name =
                    document.createElement('div');

                name.className =
                    'holder-slot-name';

                name.textContent =
                    positionName;

                slot.appendChild(name);


                const state =
                    document.createElement('div');

                state.className =
                    'holder-slot-state';


                if (
                    position.position_usage ===
                    'si_dummy'
                ) {
                    state.textContent =
                        'Si dummy';

                } else if (
                    position.position_usage ===
                    'substrate'
                ) {

                    if (position.substrate) {
                        state.textContent =
                            position.substrate.labId;
                    } else {
                        state.textContent =
                            'Substrate';
                    }

                } else {
                    state.textContent =
                        'empty';
                }


                slot.appendChild(state);

                disc.appendChild(slot);
            }
        );


        grid.appendChild(disc);


        const controls =
            document.createElement('div');

        controls.className =
            'position-controls';


        const controlsTitle =
            document.createElement('strong');

        controlsTitle.textContent =
            'Position assignment';

        controls.appendChild(
            controlsTitle
        );


        const controlsGrid =
            document.createElement('div');

        controlsGrid.className =
            'position-controls-grid';


        ['A', 'B', 'C', 'D', 'E'].forEach(
            function(positionName) {

                const position =
                    experimentState.positions[
                        positionName
                    ];


                const control =
                    document.createElement('div');

                control.className =
                    'position-control';


                const title =
                    document.createElement('div');

                title.className =
                    'position-control-title';

                title.textContent =
                    'Position ' +
                    positionName;

                control.appendChild(title);


                const substrateOption =
                    document.createElement(
                        'label'
                    );

                substrateOption.className =
                    'usage-option';


                const substrateRadio =
                    document.createElement(
                        'input'
                    );

                substrateRadio.type =
                    'radio';

                substrateRadio.name =
                    'usage_' +
                    positionName;

                substrateRadio.checked =
                    position.position_usage ===
                    'substrate';

                substrateRadio.addEventListener(
                    'change',
                    function() {
                        setPositionUsage(
                            positionName,
                            'substrate'
                        );
                    }
                );


                substrateOption.appendChild(
                    substrateRadio
                );

                substrateOption.appendChild(
                    document.createTextNode(
                        'Substrate'
                    )
                );

                control.appendChild(
                    substrateOption
                );


                const dummyOption =
                    document.createElement(
                        'label'
                    );

                dummyOption.className =
                    'usage-option';


                const dummyRadio =
                    document.createElement(
                        'input'
                    );

                dummyRadio.type =
                    'radio';

                dummyRadio.name =
                    'usage_' +
                    positionName;

                dummyRadio.checked =
                    position.position_usage ===
                    'si_dummy';

                dummyRadio.addEventListener(
                    'change',
                    function() {
                        setPositionUsage(
                            positionName,
                            'si_dummy'
                        );
                    }
                );


                dummyOption.appendChild(
                    dummyRadio
                );

                dummyOption.appendChild(
                    document.createTextNode(
                        'Si dummy'
                    )
                );

                control.appendChild(
                    dummyOption
                );


                controlsGrid.appendChild(
                    control
                );
            }
        );


        controls.appendChild(
            controlsGrid
        );

        grid.appendChild(
            controls
        );

        return;
    }


    /*
     * 3-inch holder with one centered 2-inch wafer.
     */
    if (
        experimentState.holder.layoutType ===
        'two_inch_wafer'
    ) {

        const position =
            experimentState.positions.A;

        const disc =
            document.createElement('div');

        disc.className = 'holder-disc';


        const wafer =
            document.createElement('div');

        wafer.className =
            'wafer-two-inch';

        if (position.position_usage) {
            wafer.classList.add('active');
        }

        if (
            position.position_usage ===
            'si_dummy'
        ) {
            wafer.classList.add(
                'si-dummy'
            );
        }


        const label =
            document.createElement('div');

        label.className =
            'wafer-label';

        label.textContent =
            '2" wafer';

        wafer.appendChild(label);


        const state =
            document.createElement('div');

        state.className =
            'wafer-state';

        if (
            position.position_usage ===
            'si_dummy'
        ) {

            state.textContent =
                'Si dummy';

        } else if (
            position.position_usage ===
            'substrate'
        ) {

            if (position.substrate) {
                state.textContent =
                    position.substrate.labId;
            } else {
                state.textContent =
                    'Substrate';
            }

        } else {

            state.textContent =
                'empty';
        }

        wafer.appendChild(state);
        disc.appendChild(wafer);
        grid.appendChild(disc);


        const controls =
            document.createElement('div');

        controls.className =
            'position-controls';


        const title =
            document.createElement('strong');

        title.textContent =
            'Wafer assignment';

        controls.appendChild(title);


        const controlsGrid =
            document.createElement('div');

        controlsGrid.className =
            'position-controls-grid';


        const control =
            document.createElement('div');

        control.className =
            'position-control';


        const controlTitle =
            document.createElement('div');

        controlTitle.className =
            'position-control-title';

        controlTitle.textContent =
            'Position A';

        control.appendChild(
            controlTitle
        );


        const substrateOption =
            document.createElement('label');

        substrateOption.className =
            'usage-option';


        const substrateRadio =
            document.createElement('input');

        substrateRadio.type =
            'radio';

        substrateRadio.name =
            'usage_A';

        substrateRadio.checked =
            position.position_usage ===
            'substrate';

        substrateRadio.addEventListener(
            'change',
            function() {
                setPositionUsage(
                    'A',
                    'substrate'
                );
            }
        );

        substrateOption.appendChild(
            substrateRadio
        );

        substrateOption.appendChild(
            document.createTextNode(
                'Substrate'
            )
        );

        control.appendChild(
            substrateOption
        );


        const dummyOption =
            document.createElement('label');

        dummyOption.className =
            'usage-option';


        const dummyRadio =
            document.createElement('input');

        dummyRadio.type =
            'radio';

        dummyRadio.name =
            'usage_A';

        dummyRadio.checked =
            position.position_usage ===
            'si_dummy';

        dummyRadio.addEventListener(
            'change',
            function() {
                setPositionUsage(
                    'A',
                    'si_dummy'
                );
            }
        );

        dummyOption.appendChild(
            dummyRadio
        );

        dummyOption.appendChild(
            document.createTextNode(
                'Si dummy'
            )
        );

        control.appendChild(
            dummyOption
        );


        controlsGrid.appendChild(
            control
        );

        controls.appendChild(
            controlsGrid
        );

        grid.appendChild(
            controls
        );

        return;
    }


    /*
     * 3-inch holder with one centered quarter
     * of a 2-inch wafer.
     */
    if (
        experimentState.holder.layoutType ===
        'quarter_two_inch_wafer'
    ) {

        const position =
            experimentState.positions.A;

        const disc =
            document.createElement('div');

        disc.className = 'holder-disc';


        const quarter =
            document.createElement('div');

        quarter.className =
            'wafer-quarter';

        if (position.position_usage) {
            quarter.classList.add('active');
        }

        if (
            position.position_usage ===
            'si_dummy'
        ) {
            quarter.classList.add(
                'si-dummy'
            );
        }


        const label =
            document.createElement('div');

        label.className =
            'quarter-label';


        if (
            position.position_usage ===
            'si_dummy'
        ) {

            label.textContent =
                '1/4 wafer' +
                '\nSi dummy';

        } else if (
            position.position_usage ===
            'substrate'
        ) {

            if (position.substrate) {
                label.textContent =
                    '1/4 wafer' +
                    '\n' +
                    position.substrate.labId;
            } else {
                label.textContent =
                    '1/4 wafer' +
                    '\nSubstrate';
            }

        } else {

            label.textContent =
                '1/4 wafer';
        }


        quarter.appendChild(label);
        disc.appendChild(quarter);
        grid.appendChild(disc);


        const controls =
            document.createElement('div');

        controls.className =
            'position-controls';


        const title =
            document.createElement('strong');

        title.textContent =
            'Wafer assignment';

        controls.appendChild(title);


        const controlsGrid =
            document.createElement('div');

        controlsGrid.className =
            'position-controls-grid';


        const control =
            document.createElement('div');

        control.className =
            'position-control';


        const controlTitle =
            document.createElement('div');

        controlTitle.className =
            'position-control-title';

        controlTitle.textContent =
            'Position A';

        control.appendChild(
            controlTitle
        );


        const substrateOption =
            document.createElement('label');

        substrateOption.className =
            'usage-option';


        const substrateRadio =
            document.createElement('input');

        substrateRadio.type =
            'radio';

        substrateRadio.name =
            'usage_A';

        substrateRadio.checked =
            position.position_usage ===
            'substrate';

        substrateRadio.addEventListener(
            'change',
            function() {
                setPositionUsage(
                    'A',
                    'substrate'
                );
            }
        );

        substrateOption.appendChild(
            substrateRadio
        );

        substrateOption.appendChild(
            document.createTextNode(
                'Substrate'
            )
        );

        control.appendChild(
            substrateOption
        );


        const dummyOption =
            document.createElement('label');

        dummyOption.className =
            'usage-option';


        const dummyRadio =
            document.createElement('input');

        dummyRadio.type =
            'radio';

        dummyRadio.name =
            'usage_A';

        dummyRadio.checked =
            position.position_usage ===
            'si_dummy';

        dummyRadio.addEventListener(
            'change',
            function() {
                setPositionUsage(
                    'A',
                    'si_dummy'
                );
            }
        );

        dummyOption.appendChild(
            dummyRadio
        );

        dummyOption.appendChild(
            document.createTextNode(
                'Si dummy'
            )
        );

        control.appendChild(
            dummyOption
        );


        controlsGrid.appendChild(
            control
        );

        controls.appendChild(
            controlsGrid
        );

        grid.appendChild(
            controls
        );

        return;
    }


    /*
     * XPS holder with a central insert.
     * The substrate belongs to the selected insert.
     */
    if (
        experimentState.holder.layoutType ===
        'xps_insert'
    ) {

        const position =
            experimentState.positions.A;

        const disc =
            document.createElement('div');

        disc.className = 'holder-disc';


        const opening =
            document.createElement('div');

        opening.className =
            'xps-opening';


        const insert =
            document.createElement('div');

        insert.className =
            'xps-insert';


        const insertTitle =
            document.createElement('div');

        insertTitle.className =
            'xps-insert-title';


        const insertState =
            document.createElement('div');

        insertState.className =
            'xps-insert-state';


        if (
            experimentState.holder.xpsInsert
        ) {

            insertTitle.textContent =
                experimentState.holder
                    .xpsInsert.id;

            if (
                position.position_usage ===
                'si_dummy'
            ) {
                insertState.textContent =
                    'Si dummy';

            } else if (
                position.position_usage ===
                'substrate'
            ) {

                if (position.substrate) {
                    insertState.textContent =
                        position.substrate.labId;
                } else {
                    insertState.textContent =
                        'Substrate';
                }

            } else {
                insertState.textContent =
                    'Insert selected';
            }

        } else {

            insert.classList.add('empty');

            insertTitle.textContent =
                'No XPS insert';

            insertState.textContent =
                'Select insert below';
        }


        insert.appendChild(
            insertTitle
        );

        insert.appendChild(
            insertState
        );

        opening.appendChild(
            insert
        );

        disc.appendChild(
            opening
        );

        grid.appendChild(
            disc
        );


        const controls =
            document.createElement('div');

        controls.className =
            'xps-controls';


        const insertLabel =
            document.createElement('label');

        insertLabel.textContent =
            'XPS insert';

        controls.appendChild(
            insertLabel
        );


        const select =
            document.createElement('select');

        const emptyOption =
            document.createElement('option');

        emptyOption.value = '';

        emptyOption.textContent =
            'Select XPS insert...';

        select.appendChild(
            emptyOption
        );


        xpsInsertCatalog.forEach(
            function(item) {

                const option =
                    document.createElement(
                        'option'
                    );

                option.value =
                    item.id;

                option.textContent =
                    item.id;

                if (
                    experimentState.holder
                        .xpsInsert &&
                    experimentState.holder
                        .xpsInsert.id ===
                        item.id
                ) {
                    option.selected = true;
                }

                select.appendChild(
                    option
                );
            }
        );


        select.addEventListener(
            'change',
            function() {

                const selected =
                    xpsInsertCatalog.find(
                        function(item) {
                            return (
                                item.id ===
                                select.value
                            );
                        }
                    );

                experimentState.holder
                    .xpsInsert =
                        selected || null;

                renderHolder();
                updateStatePreview();
            }
        );


        controls.appendChild(
            select
        );


        const assignment =
            document.createElement('div');

        assignment.className =
            'position-control';

        assignment.style.marginTop =
            '14px';


        const assignmentTitle =
            document.createElement('div');

        assignmentTitle.className =
            'position-control-title';

        assignmentTitle.textContent =
            'Insert sample';

        assignment.appendChild(
            assignmentTitle
        );


        const substrateOption =
            document.createElement('label');

        substrateOption.className =
            'usage-option';


        const substrateRadio =
            document.createElement('input');

        substrateRadio.type =
            'radio';

        substrateRadio.name =
            'usage_A';

        substrateRadio.checked =
            position.position_usage ===
            'substrate';

        substrateRadio.addEventListener(
            'change',
            function() {
                setPositionUsage(
                    'A',
                    'substrate'
                );
            }
        );

        substrateOption.appendChild(
            substrateRadio
        );

        substrateOption.appendChild(
            document.createTextNode(
                'Substrate'
            )
        );

        assignment.appendChild(
            substrateOption
        );


        const dummyOption =
            document.createElement('label');

        dummyOption.className =
            'usage-option';


        const dummyRadio =
            document.createElement('input');

        dummyRadio.type =
            'radio';

        dummyRadio.name =
            'usage_A';

        dummyRadio.checked =
            position.position_usage ===
            'si_dummy';

        dummyRadio.addEventListener(
            'change',
            function() {
                setPositionUsage(
                    'A',
                    'si_dummy'
                );
            }
        );

        dummyOption.appendChild(
            dummyRadio
        );

        dummyOption.appendChild(
            document.createTextNode(
                'Si dummy'
            )
        );

        assignment.appendChild(
            dummyOption
        );


        controls.appendChild(
            assignment
        );

        grid.appendChild(
            controls
        );

        return;
    }


    /*
     * Temporary fallback for other holder layouts.
     * Their specific graphics will be added separately.
     */
    Object.keys(
        experimentState.positions
    ).forEach(function(positionName) {

        const position =
            experimentState.positions[
                positionName
            ];


        const card =
            document.createElement('div');

        card.className =
            'holder-position';


        if (position.position_usage) {
            card.classList.add('active');
        }


        const title =
            document.createElement('div');

        title.className =
            'position-name';

        title.textContent =
            'Position ' +
            positionName;

        card.appendChild(title);


        const substrateOption =
            document.createElement('label');

        substrateOption.className =
            'usage-option';


        const substrateRadio =
            document.createElement('input');

        substrateRadio.type = 'radio';

        substrateRadio.name =
            'usage_' +
            positionName;

        substrateRadio.checked =
            position.position_usage ===
            'substrate';

        substrateRadio.addEventListener(
            'change',
            function() {
                setPositionUsage(
                    positionName,
                    'substrate'
                );
            }
        );


        substrateOption.appendChild(
            substrateRadio
        );

        substrateOption.appendChild(
            document.createTextNode(
                'Substrate'
            )
        );

        card.appendChild(
            substrateOption
        );


        const dummyOption =
            document.createElement('label');

        dummyOption.className =
            'usage-option';


        const dummyRadio =
            document.createElement('input');

        dummyRadio.type = 'radio';

        dummyRadio.name =
            'usage_' +
            positionName;

        dummyRadio.checked =
            position.position_usage ===
            'si_dummy';

        dummyRadio.addEventListener(
            'change',
            function() {
                setPositionUsage(
                    positionName,
                    'si_dummy'
                );
            }
        );


        dummyOption.appendChild(
            dummyRadio
        );

        dummyOption.appendChild(
            document.createTextNode(
                'Si dummy'
            )
        );

        card.appendChild(
            dummyOption
        );


        grid.appendChild(card);
    });
}


function setPositionUsage(
    positionName,
    usage
) {

    const position =
        experimentState.positions[
            positionName
        ];


    position.position_usage = usage;


    if (
        !position.pendingTreatments
    ) {
        position.pendingTreatments = [];
    }


    if (usage === 'substrate') {

        experimentState.activePositionName =
            positionName;

        document.getElementById(
            'substratePicker'
        ).style.display = 'block';

    } else if (
        usage === 'si_dummy'
    ) {

        position.substrate = null;
        position.pendingTreatments = [];

        if (
            experimentState.activePositionName ===
            positionName
        ) {
            experimentState.activePositionName =
                null;

            document.getElementById(
                'substratePicker'
            ).style.display = 'none';
        }
    }


    renderHolder();
    renderTreatmentQueue();
    updateStatePreview();
}


function updateCombinedId() {

    const element =
        document.getElementById(
            'combinedId'
        );


    if (
        experimentState.growthRunId &&
        experimentState.holder
    ) {

        element.textContent =
            experimentState.growthRunId +
            '@' +
            experimentState.holder.id;

    } else {

        element.textContent = 'â€”';
    }
}


function experimentSafePart(value) {

    return String(value || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9._@-]/g, '');
}


async function archiveEntryId(
    uploadId,
    filename
) {

    const params =
        new URLSearchParams();

    params.append(
        'upload_id',
        uploadId
    );

    params.append(
        'filename',
        filename
    );

    const response =
        await fetch(
            'api/entry-id?' +
            params.toString()
        );

    if (!response.ok) {
        throw new Error(
            'Could not calculate NOMAD entry ID (' +
            response.status +
            ').'
        );
    }

    const result =
        await response.json();

    if (!result.entry_id) {
        throw new Error(
            'NOMAD entry ID is missing.'
        );
    }

    return result.entry_id;
}


async function uploadArchiveData(
    uploadId,
    filename,
    data
) {

    const params =
        new URLSearchParams();

    params.append(
        'file_name',
        filename
    );

    params.append(
        'overwrite_if_exists',
        'false'
    );

    params.append(
        'trigger_processing',
        'true'
    );


    const response =
        await fetch(
            nomadApiBase() +
            '/uploads/' +
            encodeURIComponent(
                uploadId
            ) +
            '/raw/?' +
            params.toString(),
            {
                method: 'PUT',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body: JSON.stringify(
                    {
                        data: data
                    },
                    null,
                    2
                )
            }
        );


    if (!response.ok) {

        let detail = '';

        try {

            const errorData =
                await response.json();

            if (errorData.detail) {
                detail =
                    ': ' +
                    errorData.detail;
            }

        } catch (_) {
        }

        throw new Error(
            'Archive upload failed (' +
            response.status +
            ')' +
            detail
        );
    }
}


function filledHolderArchiveData() {

    if (!experimentState.holder) {
        throw new Error(
            'Select a holder first.'
        );
    }

    if (
        !experimentState.holder.uploadId ||
        !experimentState.holder.entryId
    ) {
        throw new Error(
            'Selected holder has no complete NOMAD reference.'
        );
    }


    const positions = [];

    Object.entries(
        experimentState.positions
    ).forEach(
        function(entry) {

            const positionName =
                entry[0];

            const position =
                entry[1];

            if (
                !position.position_usage
            ) {
                return;
            }


            const item = {
                name:
                    positionName,
                position_usage:
                    position.position_usage
            };


            if (
                position.position_usage ===
                    'substrate'
            ) {

                if (!position.substrate) {
                    throw new Error(
                        'Position ' +
                        positionName +
                        ' is marked as substrate ' +
                        'but no substrate is selected.'
                    );
                }

                if (
                    !position.substrate.uploadId ||
                    !position.substrate.entryId
                ) {
                    throw new Error(
                        'Substrate in position ' +
                        positionName +
                        ' has no complete NOMAD reference.'
                    );
                }


                item.substrate = {
                    name:
                        position.substrate.labId ||
                        position.substrate.entryName ||
                        position.substrate.entryId,

                    reference:
                        nomadArchiveReference(
                            position.substrate.uploadId,
                            position.substrate.entryId
                        )
                };
            }


            positions.push(
                item
            );
        }
    );


    if (positions.length === 0) {
        throw new Error(
            'No holder positions are configured.'
        );
    }


    const combinedId =
        experimentState.growthRunId +
        '@' +
        experimentState.holder.id;


    return {
        m_def:
            'pdi_nomad_plugin.mbe.instrument.' +
            'FilledSubstrateHolderPDI',

        name:
            combinedId,

        substrate_holder:
            nomadArchiveReference(
                experimentState.holder.uploadId,
                experimentState.holder.entryId
            ),

        positions:
            positions
    };
}


function experimentArchiveData(
    filledHolderReference
) {

    const growthRunId =
        experimentState.growthRunId;

    return {
        m_def:
            'pdi_nomad_plugin.mbe.processes.' +
            'ExperimentMbePDI',

        name:
            growthRunId,

        lab_id:
            growthRunId,

        substrate_holder: {
            reference:
                filledHolderReference
        }
    };
}


async function saveExperimentToNomad() {

    const button =
        document.getElementById(
            'saveExperimentButton'
        );

    const status =
        document.getElementById(
            'experimentSaveStatus'
        );

    const uploadId =
        document.getElementById(
            'targetUpload'
        ).value;


    if (!uploadId) {
        status.textContent =
            'Select a target upload first.';
        return;
    }

    if (!experimentState.growthRunId) {
        status.textContent =
            'Enter a Growth Run ID first.';
        return;
    }

    if (!experimentState.holder) {
        status.textContent =
            'Select a holder first.';
        return;
    }


    button.disabled = true;


    try {

        const growthRunId =
            experimentSafePart(
                experimentState.growthRunId
            );

        const holderId =
            experimentSafePart(
                experimentState.holder.id
            );

        if (
            !growthRunId ||
            !holderId
        ) {
            throw new Error(
                'Growth Run ID or holder ID is invalid.'
            );
        }


        const filledHolderFilename =
            growthRunId +
            '@' +
            holderId +
            '.FilledSubstrateHolder.archive.yaml';


        const experimentFilename =
            growthRunId +
            '.ExperimentMbe.archive.yaml';


        const filledHolderEntryId =
            await archiveEntryId(
                uploadId,
                filledHolderFilename
            );


        const filledHolderReference =
            nomadArchiveReference(
                uploadId,
                filledHolderEntryId
            );


        const filledHolderData =
            filledHolderArchiveData();


        status.textContent =
            'Saving filled holder...';


        await uploadArchiveData(
            uploadId,
            filledHolderFilename,
            filledHolderData
        );


        const experimentData =
            experimentArchiveData(
                filledHolderReference
            );


        status.textContent =
            'Saving experiment...';


        await uploadArchiveData(
            uploadId,
            experimentFilename,
            experimentData
        );


        status.textContent =
            'Saved filled holder and experiment. ' +
            'NOMAD processing was triggered.';

    } catch (error) {

        status.textContent =
            'Error: ' +
            error.message;

    } finally {

        button.disabled =
            false;
    }
}


function updateStatePreview() {

    document.getElementById(
        'statePreview'
    ).textContent =
        JSON.stringify(
            experimentState,
            null,
            2
        );
}


loadUploads();
initialiseHolderSelect();
initialiseSubstrates();
initialiseSubstrateFilterEvents();
initialiseTreatmentRecipes();
initialiseTreatmentHistory();
setDefaultSplitDateTime();
initialiseTreatmentSaveControls();
renderTreatmentQueue();
updateStatePreview();
