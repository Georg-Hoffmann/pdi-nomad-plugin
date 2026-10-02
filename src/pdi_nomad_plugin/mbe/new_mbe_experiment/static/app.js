// FIX: this used to guess the deployment base path by searching
// window.location.pathname for '/gui/' or '/dashboards/'. That breaks when
// the page is loaded in a context where neither substring appears in the
// URL (e.g. embedded inside NOMAD GUI v2), silently sending every API call
// to the wrong, unprefixed URL (404). The backend now injects the real
// base path as window.NOMAD_API_BASE (see new_mbe_experiment/app.py);
// prefer that, and only fall back to the old URL-guessing if missing.
function nomadApiBase() {
    if (window.NOMAD_API_BASE) {
        return window.NOMAD_API_BASE;
    }

    const pathname = window.location.pathname;
    const markers = ['/gui/', '/dashboards/'];

    for (const marker of markers) {
        const index = pathname.indexOf(marker);

        if (index >= 0) {
            return (
                pathname.slice(0, index) +
                '/api/v1'
            );
        }
    }

    return '/api/v1';
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

    // FIX: was POSTing to /entries/query with required.include containing
    // the bare word 'data', which /entries/query rejects with a 422 (it
    // only serves indexed doc quantities, not archive content). Reuses the
    // already-fixed queryEntriesBySchema(), which talks to
    // /entries/archive/query instead and returns the same entry shape.
    for (const treatmentSchema of treatmentSchemas) {
        const entries = await queryEntriesBySchema(
            treatmentSchema.schema,
            500,
            ['entry_id', 'upload_id', 'entry_name', 'data']
        );

        entries.forEach(function(entry) {
            treatments.push({
                entryId: entry.entry_id,
                uploadId: entry.upload_id,
                entryName: entry.entry_name || entry.entry_id,
                type: treatmentSchema.type,
                label: treatmentSchema.label,
                data: entry.data || {}
            });
        });
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
                    // FIX: without an explicit owner NOMAD defaults to owner="public",
                    // which only returns PUBLISHED entries. Lab data lives in unpublished
                    // uploads, so every query came back empty. "visible" = public + everything
                    // the logged-in user can see (login is sent automatically via cookie).
                    owner: 'visible',
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


// FIX: was POSTing to /entries/query with required.include containing
// data.* paths (e.g. 'data.lab_id'), which /entries/query rejects with a
// 422 (it only serves indexed doc quantities, not archive content). Reuses
// the already-fixed queryEntriesBySchema(), which talks to
// /entries/archive/query instead and returns the same entry shape.
async function loadSubstrates() {
    const entries = await queryEntriesBySchema(
        'pdi_nomad_plugin.mbe.materials.SubstrateMbe',
        500,
        [
            'entry_id',
            'upload_id',
            'entry_name',
            'data.lab_id',
            'data.parent_sample',
            'data.material_designation',
            'data.chemical_formula',
            'data.supplier_id',
            'data.crystal_id',
            'data.charge_id',
            'data.polishing',
            'data.surface_orientation_label',
            'data.offcut_label',
            'data.offcut_direction',
            'data.as_delivered',
            'data.processed',
            'data.grown',
            'data.geometry'
        ]
    );

    console.log('SubstrateMbe query result:', entries);

    return entries;
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
        'filterBatch',
        substrateCatalogState
            .flatMap(function(substrate) {
                return [
                    substrate.crystalId,
                    substrate.chargeId
                ];
            })
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


function cutParentEntryIds() {
    const parentIds = new Set();

    substrateCatalogState.forEach(
        function(substrate) {
            const parentEntryId =
                referenceEntryId(
                    substrate.parentSample
                );

            if (parentEntryId) {
                parentIds.add(
                    parentEntryId
                );
            }
        }
    );

    return parentIds;
}


function substrateHasBeenCut(substrate) {
    if (
        !substrate ||
        !substrate.entryId
    ) {
        return false;
    }

    return cutParentEntryIds().has(
        substrate.entryId
    );
}


function filteredSubstrates() {

    const cutParents =
        cutParentEntryIds();

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

    const batch =
        document.getElementById(
            'filterBatch'
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

            /*
             * Once child samples reference this substrate as their
             * parent, the original physical piece no longer exists.
             */
            if (
                cutParents.has(
                    substrate.entryId
                )
            ) {
                return false;
            }

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
                batch &&
                substrate.crystalId !== batch &&
                substrate.chargeId !== batch
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
        filteredSubstrates().filter(
            function(substrate) {
                return substrateFitsPosition(
                    substrate,
                    position
                );
            }
        );


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
                            data.chemical_formula ||
                            '',
                        formula:
                            data.chemical_formula ||
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
                            ),
                        geometry:
                            data.geometry || null
                    };
                }
            );


        updateSubstrateFilters();
        renderSubstrateResults();

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
        'filterBatch',
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


async function loadHolderArchive(entryId) {

    const response = await fetch(
        nomadApiBase() +
        '/entries/' +
        encodeURIComponent(entryId) +
        '/archive/query',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                required: '*'
            })
        }
     );

    if (!response.ok) {
        throw new Error(
            'Holder archive query failed: ' +
            response.status
        );
    }

    const result = await response.json();
    const archive =
        result &&
        result.data &&
        result.data.archive;

    if (!archive || !archive.data) {
        throw new Error(
            'Holder archive response has no archive.data.'
        );
    }

    return archive;
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



/* -------------------------------------------------------------------------
 * MBE holder workflow v2
 *
 * Source of truth:
 * - physical holder geometry: SubstrateHolderPDI archive
 * - current loadout: unreferenced FilledSubstrateHolderPDI
 * - historical loadout: FilledSubstrateHolderPDI referenced by ExperimentMbePDI
 *
 * No holder layout names are hard-coded here. Geometry is rendered from the
 * positions stored in the physical holder archive.
 * ------------------------------------------------------------------------- */

let holderCatalogState = {
    empty: [],
    filled: [],
    experiments: [],
    current: []
};
let insertCatalogState = [];


// FIX: /entries/query (the plain search endpoint) only accepts pre-indexed
// "doc quantities" in required.include (entry_id, upload_id, results.*, ...).
// It cannot return archive content like data.lab_id -- NOMAD rejects that
// with 422 "data.lab_id is not a doc quantity". Archive content (anything
// under "data") has to come from /entries/archive/query instead, which
// takes a nested required shape: {metadata: {...}, data: {...}}.
//
// To avoid touching every call site, this still accepts the same flat
// 'include' list callers already pass (e.g. ['entry_id', 'upload_id',
// 'entry_name', 'data.lab_id', 'mainfile']) and splits it internally:
// entry_id/upload_id are always present on the result already, 'data.x'
// entries go under required.data, everything else (entry_name, mainfile,
// published, ...) goes under required.metadata. The returned objects keep
// the exact same shape callers already expect (entry.data.x, entry.entry_name, ...).
async function queryEntriesBySchema(schema, pageSize, include) {
    const fields = include || ['entry_id', 'upload_id', 'entry_name'];
    const metadataRequired = {};
    const dataRequired = {};

    let wantsFullData = false;
    for (const field of fields) {
        if (field === 'entry_id' || field === 'upload_id') {
            continue;
        }
        if (field === 'data') {
            // Bare 'data' means 'the whole data section'.
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

    const response = await fetch(
        nomadApiBase() + '/entries/archive/query',
        {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                // FIX: without an explicit owner NOMAD defaults to owner="public",
                // which only returns PUBLISHED entries. Lab data lives in unpublished
                // uploads, so every query came back empty. "visible" = public + everything
                // the logged-in user can see (login is sent automatically via cookie).
                owner: 'visible',
                query: {
                    'section_defs.definition_qualified_name': schema
                },
                pagination: {page_size: pageSize || 500},
                required: required
            })
        }
    );
    if (!response.ok) {
        throw new Error('NOMAD query failed for ' + schema + ': ' + response.status);
    }
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


async function queryExperimentHolderReferences() {
    const response = await fetch(
        nomadApiBase() + '/entries/archive/query',
        {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                // FIX: without an explicit owner NOMAD defaults to owner="public",
                // which only returns PUBLISHED entries. Lab data lives in unpublished
                // uploads, so every query came back empty. "visible" = public + everything
                // the logged-in user can see (login is sent automatically via cookie).
                owner: 'visible',
                query: {
                    'section_defs.definition_qualified_name':
                        'pdi_nomad_plugin.mbe.processes.ExperimentMbePDI'
                },
                pagination: {page_size: 1000},
                required: {
                    data: {
                        substrate_holder: {
                            reference: '*'
                        }
                    }
                }
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            'Experiment holder-reference query failed: ' +
            response.status
        );
    }

    const result = await response.json();
    return (result.data || []).map(function(entry) {
        const archive = entry.archive || {};
        return {
            entry_id: entry.entry_id,
            upload_id: entry.upload_id,
            data: archive.data || {}
        };
    });
}


function entryIdFromReference(reference) {
    if (!reference) return null;
    if (typeof reference === 'object') {
        reference = reference.reference || '';
    }
    const match = String(reference).match(/\/archive\/([^/#?]+)(?:#|$)/);
    return match ? match[1] : null;
}


function referenceValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.reference || '';
}


function filledPhysicalReference(data) {
    return referenceValue(data && data.substrate_holder);
}


function isDiscardedLoadout(data) {
    const tags = data && Array.isArray(data.tags) ? data.tags : [];
    return tags.includes('discarded_loadout');
}


async function loadHolderCatalogV2() {
    const [emptyRaw, filledRaw, experiments] = await Promise.all([
        queryEntriesBySchema(
            'pdi_nomad_plugin.mbe.instrument.SubstrateHolderPDI',
            500,
            ['entry_id', 'upload_id', 'entry_name', 'data']
        ),
        queryEntriesBySchema(
            'pdi_nomad_plugin.mbe.instrument.FilledSubstrateHolderPDI',
            500,
            ['entry_id', 'upload_id', 'entry_name', 'data', 'mainfile', 'published']
        ),
        queryExperimentHolderReferences()
    ]);

    const empty = emptyRaw.filter(function(entry) {
        const mDef = String((entry.data || {}).m_def || '');
        return !mDef.includes('FilledSubstrateHolderPDI');
    });
    const filled = filledRaw.filter(function(entry) {
        const mDef = String((entry.data || {}).m_def || '');
        return !mDef || mDef.includes('FilledSubstrateHolderPDI');
    });

    const referencedFilled = new Set();
    experiments.forEach(function(entry) {
        const data = entry.data || {};
        const holderRef = data.substrate_holder && data.substrate_holder.reference;
        const id = entryIdFromReference(holderRef);
        if (id) referencedFilled.add(id);
    });

    const current = [];
    for (const entry of filled) {
        let data = entry.data || {};
        if (!filledPhysicalReference(data)) {
            try {
                const archive = await loadHolderArchive(entry.entry_id);
                data = archive.data || data;
                entry.data = data;
                entry._archiveMetadata = archive.metadata || {};
            } catch (error) {
                console.warn('Could not resolve filled holder', entry.entry_id, error);
            }
        }
        if (!referencedFilled.has(entry.entry_id) && !isDiscardedLoadout(data)) {
            current.push(entry);
        }
    }

    holderCatalogState = {empty, filled, experiments, current};
    return holderCatalogState;
}


async function loadInsertCatalogV2() {
    try {
        const entries = await queryEntriesBySchema(
            'pdi_nomad_plugin.mbe.instrument.InsertReductionPDI',
            200,
            [
                'entry_id',
                'upload_id',
                'entry_name',
                'data.lab_id',
                'data.name',
                'data.inner_geometry',
                'data.outer_geometry'
            ]
        );
        insertCatalogState = entries.map(function(entry) {
            const data = entry.data || {};
            return {
                entryId: entry.entry_id,
                uploadId: entry.upload_id,
                name: data.lab_id || data.name || entry.entry_name || entry.entry_id,
                innerGeometry: data.inner_geometry || null,
                outerGeometry: data.outer_geometry || null
            };
        });
    } catch (error) {
        console.warn('InsertReductionPDI catalog could not be loaded.', error);
        insertCatalogState = [];
    }
}


async function initialiseHolderSelect() {
    const select = document.getElementById('holderSelect');
    const status = document.getElementById('holderCatalogStatus');
    select.innerHTML = '<option value="">Loading holders...</option>';
    if (status) status.textContent = 'Loading physical and filled holders from NOMAD...';

    try {
        const catalog = await loadHolderCatalogV2();
        await loadInsertCatalogV2();
        const currentByPhysical = new Map();
        catalog.current.forEach(function(entry) {
            const physicalId = entryIdFromReference(filledPhysicalReference(entry.data || {}));
            if (physicalId) currentByPhysical.set(physicalId, entry);
        });

        select.innerHTML = '<option value="">Select holder...</option>';

        catalog.current
            .slice()
            .sort(function(a, b) {
                return String(a.entry_name || a.entry_id).localeCompare(String(b.entry_name || b.entry_id));
            })
            .forEach(function(entry) {
                const option = document.createElement('option');
                option.value = entry.entry_id;
                option.dataset.kind = 'filled';
                option.dataset.uploadId = entry.upload_id || '';
                option.textContent = (entry.entry_name || entry.entry_id) + ' — Current filled holder';
                select.appendChild(option);
            });

        catalog.empty
            .filter(function(entry) {
                return !currentByPhysical.has(entry.entry_id);
            })
            .sort(function(a, b) {
                return String(a.entry_name || a.entry_id).localeCompare(String(b.entry_name || b.entry_id));
            })
            .forEach(function(entry) {
                const option = document.createElement('option');
                option.value = entry.entry_id;
                option.dataset.kind = 'empty';
                option.dataset.uploadId = entry.upload_id || '';
                option.textContent = (entry.entry_name || entry.entry_id) + ' — Empty holder';
                select.appendChild(option);
            });

        if (status) {
            status.textContent =
                catalog.current.length + ' current filled holder(s); ' +
                catalog.empty.length + ' physical holder template(s) found.';
        }
    } catch (error) {
        console.error(error);
        select.innerHTML = '<option value="">Could not load holders</option>';
        if (status) status.textContent = 'Error: ' + error.message;
    }
}


function makePositionState(position) {
    return {
        position_usage: null,
        substrate: null,
        insertReduction: null,
        pendingTreatments: [],
        rho: position.rho,
        theta: position.theta,
        x_position: position.x_position,
        y_position: position.y_position,
        slot_geometry: position.slot_geometry || null
    };
}


function resolveSubstrateFromFilled(position) {
    const substrateRef = position && position.substrate;
    const reference = referenceValue(substrateRef);
    const entryId = entryIdFromReference(reference);
    if (!entryId) return null;
    const known = substrateCatalogState.find(function(item) {
        return item.entryId === entryId;
    });
    if (known) return Object.assign({}, known);
    return {
        entryId: entryId,
        uploadId: '',
        entryName: substrateRef && substrateRef.name ? substrateRef.name : entryId,
        labId: substrateRef && substrateRef.name ? substrateRef.name : entryId,
        reference: reference
    };
}


function resolveInsertFromFilled(position) {
    const insert = position && position.insert_reduction;
    const reference = referenceValue(insert);
    const entryId = entryIdFromReference(reference);
    if (!entryId) return null;
    const known = insertCatalogState.find(function(item) {
        return item.entryId === entryId;
    });
    if (known) return Object.assign({}, known);
    return {
        entryId: entryId,
        uploadId: '',
        name: insert && insert.name ? insert.name : entryId,
        reference: reference
    };
}


function applyFilledOverlay(filledData) {
    const filledPositions = Array.isArray(filledData.positions) ? filledData.positions : [];
    filledPositions.forEach(function(item) {
        if (!item.name || !experimentState.positions[item.name]) return;
        const target = experimentState.positions[item.name];
        target.position_usage = item.position_usage || (item.substrate ? 'substrate' : null);
        target.substrate = resolveSubstrateFromFilled(item);
        target.insertReduction = resolveInsertFromFilled(item);
    });
}


async function selectHolder() {
    const select = document.getElementById('holderSelect');
    const entryId = select.value;
    const option = select.options[select.selectedIndex];

    if (!entryId) {
        resetHolderSelection(false);
        return;
    }

    document.getElementById('holderLabel').textContent = 'Loading holder...';
    document.getElementById('holderGrid').innerHTML = '<p class="small">Loading holder archive...</p>';

    try {
        const selectedArchive = await loadHolderArchive(entryId);
        const selectedData = selectedArchive.data || {};
        const kind = option.dataset.kind ||
            (String(selectedData.m_def || '').includes('FilledSubstrateHolderPDI') ? 'filled' : 'empty');

        let physicalArchive = selectedArchive;
        let physicalEntryId = entryId;
        let filledHolder = null;

        if (kind === 'filled') {
            const physicalRef = filledPhysicalReference(selectedData);
            physicalEntryId = entryIdFromReference(physicalRef);
            if (!physicalEntryId) {
                throw new Error('Filled holder has no valid physical holder reference.');
            }
            physicalArchive = await loadHolderArchive(physicalEntryId);
            filledHolder = {
                entryId: entryId,
                uploadId: (selectedArchive.metadata || {}).upload_id || option.dataset.uploadId || '',
                name: selectedData.name || option.textContent,
                mainfile: (selectedArchive.metadata || {}).mainfile || '',
                published: (selectedArchive.metadata || {}).published === true,
                data: selectedData,
                metadata: selectedArchive.metadata || {}
            };
        }

        const physicalData = physicalArchive.data || {};
        const physicalMetadata = physicalArchive.metadata || {};
        const holderName = physicalData.lab_id || physicalData.name || option.textContent || physicalEntryId;
        const positions = Array.isArray(physicalData.positions) ? physicalData.positions : [];

        experimentState.holder = {
            id: holderName,
            entryId: physicalEntryId,
            uploadId: physicalMetadata.upload_id || '',
            archiveData: physicalData,
            metadata: physicalMetadata,
            filledHolder: filledHolder,
            selectedKind: kind
        };
        experimentState.positions = {};
        positions.forEach(function(position) {
            if (position.name) experimentState.positions[position.name] = makePositionState(position);
        });
        if (filledHolder) applyFilledOverlay(selectedData);
        experimentState.activePositionName = null;
        experimentState.currentFilledDirty = false;
        experimentState.experimentSaved = false;

        document.getElementById('holderLabel').textContent =
            holderName + (filledHolder ? ' · current loadout' : ' · empty');
        renderHolderImageV2();
        renderHolder();
        document.getElementById('substratePicker').style.display = 'none';
        updateCombinedId();
        updateStatePreview();
    } catch (error) {
        console.error(error);
        resetHolderSelection(false);
        document.getElementById('holderLabel').textContent = 'Could not load holder';
        document.getElementById('holderGrid').innerHTML =
            '<div class="warning">Could not load holder data from NOMAD: ' + escapeHtml(String(error.message || error)) + '</div>';
    }
}


function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


function holderRawFileUrl(imagePath) {
    if (!experimentState.holder || !imagePath) return '';
    let rawPath = String(imagePath).replace(/^\.\//, '');
    const mainfile = String((experimentState.holder.metadata || {}).mainfile || '');
    if (!rawPath.includes('/') && mainfile.includes('/')) {
        rawPath = mainfile.slice(0, mainfile.lastIndexOf('/') + 1) + rawPath;
    }
    const encodedPath = rawPath.split('/').map(encodeURIComponent).join('/');
    return nomadApiBase() + '/uploads/' +
        encodeURIComponent(experimentState.holder.uploadId) + '/raw/' + encodedPath;
}


function renderHolderImageV2() {
    const wrap = document.getElementById('holderImageWrap');
    const image = document.getElementById('holderImage');
    if (!wrap || !image || !experimentState.holder) return;
    const imagePath = experimentState.holder.archiveData && experimentState.holder.archiveData.image;
    if (!imagePath) {
        wrap.style.display = 'none';
        image.removeAttribute('src');
        return;
    }
    image.onload = function() { wrap.style.display = 'block'; };
    image.onerror = function() { wrap.style.display = 'none'; };
    image.src = holderRawFileUrl(imagePath);
}


function positionCoordinates(position) {
    const x = Number(position.x_position);
    const y = Number(position.y_position);
    if (Number.isFinite(x) && Number.isFinite(y)) return {x: x, y: y};
    const rho = Number(position.rho);
    const theta = Number(position.theta);
    if (Number.isFinite(rho) && Number.isFinite(theta)) {
        const rad = theta * Math.PI / 180;
        return {x: rho * Math.cos(rad), y: rho * Math.sin(rad)};
    }
    return {x: 0, y: 0};
}



function geometryNumber(value) {
    if (
        typeof value === 'number' &&
        Number.isFinite(value)
    ) {
        return value;
    }

    if (
        value &&
        typeof value === 'object' &&
        typeof value.magnitude === 'number' &&
        Number.isFinite(value.magnitude)
    ) {
        return value.magnitude;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed)
        ? parsed
        : null;
}


function geometryXY(geometry) {
    if (
        !geometry ||
        typeof geometry !== 'object'
    ) {
        return null;
    }

    const width =
        geometryNumber(geometry.width);

    let length =
        geometryNumber(geometry.length);

    if (!Number.isFinite(width)) {
        return null;
    }

    if (!Number.isFinite(length)) {
        length = width;
    }

    return {
        width: width,
        length: length
    };
}


function geometryMatches(first, second) {
    const a = geometryXY(first);
    const b = geometryXY(second);

    if (!a || !b) {
        return false;
    }

    const tolerance = 0.00005;

    const direct =
        Math.abs(a.width - b.width) <= tolerance &&
        Math.abs(a.length - b.length) <= tolerance;

    const rotated =
        Math.abs(a.width - b.length) <= tolerance &&
        Math.abs(a.length - b.width) <= tolerance;

    return direct || rotated;
}


function effectivePositionGeometry(position) {
    if (
        position &&
        position.insertReduction &&
        position.insertReduction.innerGeometry
    ) {
        return position.insertReduction.innerGeometry;
    }

    return position
        ? position.slot_geometry
        : null;
}


function insertFitsPosition(insert, position) {
    if (!insert || !position) {
        return false;
    }

    if (!geometryXY(position.slot_geometry)) {
        return true;
    }

    if (!geometryXY(insert.outerGeometry)) {
        return false;
    }

    return geometryMatches(
        insert.outerGeometry,
        position.slot_geometry
    );
}


function substrateFitsPosition(substrate, position) {
    if (!substrate || !position) {
        return false;
    }

    const target =
        effectivePositionGeometry(position);

    if (!geometryXY(target)) {
        return true;
    }

    if (!geometryXY(substrate.geometry)) {
        return false;
    }

    return geometryMatches(
        substrate.geometry,
        target
    );
}


function insertWindowPercent(position) {
    if (
        !position ||
        !position.insertReduction
    ) {
        return null;
    }

    const inner =
        geometryXY(
            position.insertReduction.innerGeometry
        );

    const outer =
        geometryXY(
            position.insertReduction.outerGeometry
        );

    if (!inner || !outer) {
        return null;
    }

    if (
        outer.width <= 0 ||
        outer.length <= 0
    ) {
        return null;
    }

    return {
        width: Math.max(
            10,
            Math.min(
                100,
                100 * inner.width / outer.width
            )
        ),
        height: Math.max(
            10,
            Math.min(
                100,
                100 * inner.length / outer.length
            )
        )
    };
}


function positionDisplayState(position) {
    if (!position.position_usage) return 'empty';
    if (position.position_usage === 'substrate') {
        return position.substrate ? (position.substrate.labId || position.substrate.entryName || 'Substrate') : 'Select substrate';
    }
    if (position.position_usage === 'si_dummy') return 'Si dummy';
    if (position.position_usage === 'sapphire_dummy') return 'Sapphire / Al₂O₃ dummy';
    return position.position_usage;
}


function selectHolderPosition(positionName) {
    if (!experimentState.positions[positionName]) return;
    experimentState.activePositionName = positionName;
    renderHolder();
    const position = experimentState.positions[positionName];
    const picker = document.getElementById('substratePicker');
    const label = document.getElementById('activePositionLabel');
    if (label) label.textContent = 'Active holder position: ' + positionName;
    picker.style.display = position.position_usage === 'substrate' ? 'block' : 'none';
    if (position.position_usage === 'substrate') {
        renderSubstrateResults();
        renderTreatmentHistory();
    }
    updateProcessingButtonV2();
}


function renderHolder() {
    const grid = document.getElementById('holderGrid');

    const positionControlsPanel =
        document.getElementById('positionControlsPanel');
    grid.innerHTML = '';

    if (positionControlsPanel) {
        positionControlsPanel.innerHTML = '';
    }
    if (!experimentState.holder) return;

    const names = Object.keys(experimentState.positions);
    if (!names.length) {
        grid.innerHTML = '<div class="warning">This physical holder has no positions in NOMAD.</div>';
        return;
    }

    const disc = document.createElement('div');
    disc.className = 'holder-disc holder-disc-generic';
    const coords = names.map(function(name) {
        return {name: name, coord: positionCoordinates(experimentState.positions[name])};
    });
    let maxRadius = 0;
    coords.forEach(function(item) {
        maxRadius = Math.max(maxRadius, Math.hypot(item.coord.x, item.coord.y));
    });
    if (!maxRadius) maxRadius = 1;

    coords.forEach(function(item) {
        const position = experimentState.positions[item.name];
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = 'holder-slot generic-slot';
        if (position.position_usage) slot.classList.add('active');
        if (position.position_usage && position.position_usage !== 'substrate') slot.classList.add('si-dummy');
        if (experimentState.activePositionName === item.name) slot.classList.add('selected-position');
        slot.style.left = (50 + 36 * item.coord.x / maxRadius) + '%';
        slot.style.top = (50 + 36 * item.coord.y / maxRadius) + '%';
        slot.innerHTML =
            '<span class="holder-slot-name">' + escapeHtml(item.name) + '</span>' +
            '<span class="holder-slot-state">' + escapeHtml(positionDisplayState(position)) + '</span>';

        const insertSize = insertWindowPercent(position);

        if (insertSize) {
            const insertWindow = document.createElement('span');
            insertWindow.className = 'holder-insert-window';
            insertWindow.style.width = insertSize.width + '%';
            insertWindow.style.height = insertSize.height + '%';
            slot.appendChild(insertWindow);
        }

        slot.addEventListener('click', function() {
            selectHolderPosition(item.name);
        });
        disc.appendChild(slot);
    });

    grid.appendChild(disc);

    if (!experimentState.activePositionName || !experimentState.positions[experimentState.activePositionName]) {
        const help = document.createElement('p');
        help.className = 'small holder-help';
        help.textContent = 'Click a holder position to assign a substrate or dummy.';
        grid.appendChild(help);
        return;
    }

    const positionName = experimentState.activePositionName;
    const position = experimentState.positions[positionName];
    const controls = document.createElement('div');
    controls.className = 'position-controls active-position-controls';
    controls.innerHTML = '<strong>Position ' + escapeHtml(positionName) + '</strong>';

    const row = document.createElement('div');
    row.className = 'assignment-buttons';
    [
        {value: null, label: 'Empty'},
        {value: 'substrate', label: 'Substrate'},
        {value: 'si_dummy', label: 'Si dummy'},
        {value: 'sapphire_dummy', label: 'Sapphire / Al₂O₃ dummy'}
    ].forEach(function(item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = item.value === position.position_usage ? 'primary' : 'secondary';
        button.textContent = item.label;
        button.addEventListener('click', function() { setPositionUsage(positionName, item.value); });
        row.appendChild(button);
    });
    controls.appendChild(row);

    if (insertCatalogState.length) {
        const insertLabel = document.createElement('label');
        insertLabel.textContent = 'Insert reduction (optional)';
        controls.appendChild(insertLabel);
        const insertSelect = document.createElement('select');
        insertSelect.innerHTML = '<option value="">No insert</option>';
        insertCatalogState
            .filter(function(insert) {
                return insertFitsPosition(
                    insert,
                    position
                );
            })
            .forEach(function(insert) {
            const option = document.createElement('option');
            option.value = insert.entryId;
            option.textContent = insert.name;
            option.selected = position.insertReduction && position.insertReduction.entryId === insert.entryId;
            insertSelect.appendChild(option);
        });
        insertSelect.addEventListener('change', function() {
            position.insertReduction = insertCatalogState.find(function(insert) {
                return insert.entryId === insertSelect.value;
            }) || null;

            if (
                position.substrate &&
                geometryXY(position.substrate.geometry) &&
                !substrateFitsPosition(
                    position.substrate,
                    position
                )
            ) {
                position.substrate = null;
                position.pendingTreatments = [];
            }

            experimentState.currentFilledDirty = true;

            renderHolder();

            if (
                position.position_usage ===
                'substrate'
            ) {
                renderSubstrateResults();
                renderTreatmentHistory();
            }

            updateProcessingButtonV2();
            updateStatePreview();
        });
        controls.appendChild(insertSelect);
    }

    if (positionControlsPanel) {
        positionControlsPanel.appendChild(controls);
    } else {
        grid.appendChild(controls);
    }
}


function setPositionUsage(positionName, usage) {
    const position = experimentState.positions[positionName];
    if (!position) return;
    position.position_usage = usage;
    if (usage !== 'substrate') {
        position.substrate = null;
        position.pendingTreatments = [];
    }
    experimentState.activePositionName = positionName;
    experimentState.currentFilledDirty = true;
    const picker = document.getElementById('substratePicker');
    const label = document.getElementById('activePositionLabel');
    if (label) label.textContent = 'Active holder position: ' + positionName;
    picker.style.display = usage === 'substrate' ? 'block' : 'none';
    renderHolder();
    if (usage === 'substrate') {
        renderSubstrateResults();
        renderTreatmentHistory();
    }
    updateProcessingButtonV2();
    updateStatePreview();
}


const selectSubstrateOriginal = selectSubstrate;
selectSubstrate = function(substrate) {
    const position = getActivePosition();
    if (!position || position.position_usage !== 'substrate') return;
    position.substrate = {
        entryId: substrate.entryId,
        uploadId: substrate.uploadId,
        entryName: substrate.entryName,
        labId: substrate.labId,
        parentSample: substrate.parentSample,
        material: substrate.material,
        formula: substrate.formula,
        supplierId: substrate.supplierId,
        crystalId: substrate.crystalId,
        chargeId: substrate.chargeId,
        polishing: substrate.polishing,
        orientation: substrate.orientation,
        offcut: substrate.offcut,
        offcutDirection: substrate.offcutDirection,
        asDelivered: substrate.asDelivered,
        processed: substrate.processed,
        grown: substrate.grown,
        geometry: substrate.geometry || null
    };
    position.pendingTreatments = [];
    experimentState.currentFilledDirty = true;
    renderHolder();
    renderSubstrateResults();
    renderTreatmentHistory();
    updateProcessingButtonV2();
    updateStatePreview();

    // Re-read the selected substrate and related treatment state from NOMAD
    // without doing a browser reload, which would discard the unsaved holder.
    refreshSubstrateData().catch(function(error) {
        console.error('Could not refresh substrate data after selection:', error);
    });
};


function updateProcessingButtonV2() {
    const button = document.getElementById('openProcessingButton');
    if (!button) return;
    const position = getActivePosition();
    button.disabled = !(position && position.substrate && position.substrate.entryId);
}


function processingDashboardUrl() {
    const pathname = window.location.pathname;
    const marker = '/dashboards/';
    const index = pathname.indexOf(marker);
    const base = index >= 0 ? pathname.slice(0, index) : '';
    return base + '/dashboards/processing/';
}


function openSelectedSubstrateInProcessing() {
    const position = getActivePosition();
    if (!position || !position.substrate) return;
    const params = new URLSearchParams();
    params.set('substrate_entry_id', position.substrate.entryId);
    params.set('return_url', window.location.href);
    window.location.href = processingDashboardUrl() + '?' + params.toString();
}


async function refreshSubstrateData() {
    const position = getActivePosition();
    const selectedId = position && position.substrate ? position.substrate.entryId : null;
    await Promise.all([initialiseSubstrates(), initialiseTreatmentHistory()]);
    if (selectedId && position) {
        const refreshed =
            substrateCatalogState.find(
                function(item) {
                    return (
                        item.entryId ===
                        selectedId
                    );
                }
            );

        if (
            refreshed &&
            substrateHasBeenCut(
                refreshed
            )
        ) {
            position.substrate = null;
            position.pendingTreatments = [];
            experimentState.currentFilledDirty = true;
        } else if (refreshed) {
            position.substrate =
                Object.assign(
                    {},
                    refreshed
                );
        }
    }
    renderSubstrateResults();
    renderTreatmentHistory();
    renderHolder();
    updateProcessingButtonV2();
}


function renderTreatmentQueue() {
    const container = document.getElementById('treatmentQueue');
    if (!container) return;
    container.innerHTML = '<p class="small">Treatments are managed in the Substrate Processing app.</p>';
}


function filledHolderArchiveData() {
    if (!experimentState.holder) throw new Error('Select a holder first.');
    if (!experimentState.holder.uploadId || !experimentState.holder.entryId) {
        throw new Error('Selected physical holder has no complete NOMAD reference.');
    }

    const positions = [];
    Object.entries(experimentState.positions).forEach(function(entry) {
        const positionName = entry[0];
        const position = entry[1];
        if (!position.position_usage) return;
        const item = {name: positionName, position_usage: position.position_usage};
        if (position.position_usage === 'substrate') {
            if (!position.substrate) {
                throw new Error('Position ' + positionName + ' is marked as substrate but no substrate is selected.');
            }

            if (
                substrateHasBeenCut(
                    position.substrate
                )
            ) {
                throw new Error(
                    'Substrate ' +
                    (
                        position.substrate.labId ||
                        position.substrate.entryName ||
                        position.substrate.entryId
                    ) +
                    ' has been cut into child samples and is no longer physically available.'
                );
            }

            let ref = position.substrate.reference || '';
            if (!ref) {
                if (!position.substrate.uploadId || !position.substrate.entryId) {
                    throw new Error('Substrate in position ' + positionName + ' has no complete NOMAD reference.');
                }
                ref = nomadArchiveReference(position.substrate.uploadId, position.substrate.entryId);
            }
            item.substrate = {
                name: position.substrate.labId || position.substrate.entryName || position.substrate.entryId,
                reference: ref
            };
        }
        if (position.insertReduction) {
            let insertRef = position.insertReduction.reference || '';
            if (!insertRef && position.insertReduction.uploadId && position.insertReduction.entryId) {
                insertRef = nomadArchiveReference(position.insertReduction.uploadId, position.insertReduction.entryId);
            }
            if (insertRef) {
                item.insert_reduction = {
                    name: position.insertReduction.name || position.insertReduction.entryId,
                    reference: insertRef
                };
            }
        }
        positions.push(item);
    });

    if (!positions.length) throw new Error('No holder positions are configured.');

    const existing = experimentState.holder.filledHolder;
    const now = new Date();
    const dateLabel = now.toISOString().slice(0, 10);
    const name = existing && existing.data && existing.data.name ?
        existing.data.name : experimentState.holder.id + ' fill ' + dateLabel;
    const existingTags = existing && existing.data && Array.isArray(existing.data.tags) ? existing.data.tags : [];

    return {
        m_def: 'pdi_nomad_plugin.mbe.instrument.FilledSubstrateHolderPDI',
        name: name,
        lab_id: experimentState.holder.id,
        datetime: existing && existing.data ? existing.data.datetime : now.toISOString(),
        tags: existingTags.filter(function(tag) { return tag !== 'discarded_loadout'; }),
        substrate_holder: nomadArchiveReference(experimentState.holder.uploadId, experimentState.holder.entryId),
        positions: positions
    };
}


async function uploadArchiveDataV2(uploadId, filename, data, overwrite) {
    const params = new URLSearchParams();
    params.append('file_name', filename);
    params.append('overwrite_if_exists', overwrite ? 'true' : 'false');
    params.append('trigger_processing', 'true');
    params.append('wait_for_processing', 'true');
    const response = await fetch(
        nomadApiBase() + '/uploads/' + encodeURIComponent(uploadId) + '/raw/?' + params.toString(),
        {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({data: data}, null, 2)
        }
    );
    if (!response.ok) {
        let detail = '';
        try {
            const errorData = await response.json();
            detail = errorData.detail ? ': ' + errorData.detail : '';
        } catch (_) {}
        throw new Error('Archive upload failed (' + response.status + ')' + detail);
    }
}


function loadoutTimestamp() {
    return new Date().toISOString().replace(/[-:TZ.]/g, '');
}


async function saveFilledHolderToNomad(options) {
    options = options || {};
    const button = document.getElementById('saveFilledHolderButton');
    const status = document.getElementById('filledHolderSaveStatus');
    const targetUpload = document.getElementById('targetUpload').value;
    if (!experimentState.holder) {
        if (status) status.textContent = 'Select a holder first.';
        throw new Error('Select a holder first.');
    }

    const existing = experimentState.holder.filledHolder;
    let uploadId;
    let filename;
    let entryId;
    let overwrite = false;

    if (existing) {
        if (existing.published) {
            if (status) status.textContent = 'Published filled holders are read-only.';
            throw new Error('Published filled holders are read-only.');
        }
        uploadId = existing.uploadId;
        filename = existing.mainfile;
        entryId = existing.entryId;
        overwrite = true;
        if (!uploadId || !filename || !entryId) {
            throw new Error('Existing filled holder lacks upload, mainfile, or entry ID and cannot be updated safely.');
        }
    } else {
        if (!targetUpload) {
            if (status) status.textContent = 'Select a target upload first.';
            throw new Error('Select a target upload first.');
        }
        uploadId = targetUpload;
        const holderId = experimentSafePart(experimentState.holder.id);
        filename = holderId + '_fill_' + loadoutTimestamp() + '.FilledSubstrateHolder.archive.yaml';
        entryId = await archiveEntryId(uploadId, filename);
    }

    if (button) button.disabled = true;
    try {
        if (status && !options.silent) status.textContent = existing ? 'Updating filled holder...' : 'Saving filled holder...';
        const data = filledHolderArchiveData();
        await uploadArchiveDataV2(uploadId, filename, data, overwrite);
        experimentState.holder.filledHolder = {
            entryId: entryId,
            uploadId: uploadId,
            name: data.name,
            mainfile: filename,
            published: false,
            data: data,
            metadata: {upload_id: uploadId, mainfile: filename, published: false}
        };
        experimentState.currentFilledDirty = false;
        if (status && !options.silent) status.textContent = 'Filled holder saved. You can close the app and continue later.';
        updateStatePreview();

        await refreshSubstrateData();
        await initialiseHolderSelect();

        const holderSelect =
            document.getElementById('holderSelect');

        if (
            holderSelect &&
            Array.from(holderSelect.options).some(
                function(option) {
                    return option.value === entryId;
                }
            )
        ) {
            holderSelect.value = entryId;
        }

        return nomadArchiveReference(uploadId, entryId);
    } catch (error) {
        if (status && !options.silent) status.textContent = 'Error: ' + error.message;
        throw error;
    } finally {
        if (button) button.disabled = false;
    }
}


async function saveExperimentToNomad() {
    const button = document.getElementById('saveExperimentButton');
    const status = document.getElementById('experimentSaveStatus');
    const uploadId = document.getElementById('targetUpload').value;
    if (!uploadId) { status.textContent = 'Select a target upload first.'; return; }
    if (!experimentState.growthRunId) { status.textContent = 'Enter a Growth Run ID first.'; return; }
    if (!experimentState.holder) { status.textContent = 'Select a holder first.'; return; }

    button.disabled = true;
    let filledSavedThisAttempt = false;
    try {
        let filledReference;
        if (!experimentState.holder.filledHolder || experimentState.currentFilledDirty) {
            status.textContent = 'Saving filled holder...';
            filledReference = await saveFilledHolderToNomad({silent: true});
            filledSavedThisAttempt = true;
        } else {
            const filled = experimentState.holder.filledHolder;
            filledReference = nomadArchiveReference(filled.uploadId, filled.entryId);
        }

        const growthRunId = experimentSafePart(experimentState.growthRunId);
        if (!growthRunId) throw new Error('Growth Run ID is invalid.');
        const experimentFilename = growthRunId + '.ExperimentMbe.archive.yaml';
        const experimentData = experimentArchiveData(filledReference);
        status.textContent = 'Saving experiment...';
        await uploadArchiveDataV2(uploadId, experimentFilename, experimentData, false);

        experimentState.experimentSaved = true;
        status.textContent =
            'Experiment saved. NOMAD processing was triggered; linked substrates will be marked grown by the ExperimentMbePDI normalizer.';
        document.getElementById('startNewExperimentButton').style.display = 'block';
        updateStatePreview();

        await refreshSubstrateData();
        await initialiseHolderSelect();

        window.location.reload();
    } catch (error) {
        status.textContent = (filledSavedThisAttempt ?
            'Filled holder was saved, but the experiment failed: ' : 'Error: ') + error.message;
    } finally {
        button.disabled = false;
    }
}


async function emptyCurrentHolder() {
    const status = document.getElementById('filledHolderSaveStatus');
    if (!experimentState.holder) {
        status.textContent = 'Select a holder first.';
        return;
    }
    const filled = experimentState.holder.filledHolder;
    if (!filled) {
        resetHolderSelection(true);
        status.textContent = 'Unsaved loadout cleared; physical holder is available.';
        return;
    }
    if (filled.published) {
        status.textContent = 'Published filled holders are read-only and cannot be emptied.';
        return;
    }
    if (!filled.uploadId || !filled.mainfile) {
        status.textContent = 'Filled holder cannot be updated safely because its raw file is unknown.';
        return;
    }

    try {
        const data = filledHolderArchiveData();
        const tags = Array.isArray(data.tags) ? data.tags.slice() : [];
        if (!tags.includes('discarded_loadout')) tags.push('discarded_loadout');
        data.tags = tags;
        await uploadArchiveDataV2(filled.uploadId, filled.mainfile, data, true);
        status.textContent = 'Holder released. The unused loadout was retained in NOMAD and marked discarded.';
        resetHolderSelection(true);
        await initialiseHolderSelect();
    } catch (error) {
        status.textContent = 'Error: ' + error.message;
    }
}


function resetHolderSelection(clearSelect) {
    experimentState.holder = null;
    experimentState.positions = {};
    experimentState.activePositionName = null;
    experimentState.currentFilledDirty = false;
    if (clearSelect) document.getElementById('holderSelect').value = '';
    document.getElementById('holderLabel').textContent = 'No holder selected';
    document.getElementById('holderGrid').innerHTML = '';
    document.getElementById('substratePicker').style.display = 'none';
    const wrap = document.getElementById('holderImageWrap');
    if (wrap) wrap.style.display = 'none';
    updateCombinedId();
    updateStatePreview();
}


async function startNewExperiment() {
    const targetUpload = document.getElementById('targetUpload').value;
    experimentState.growthRunId = '';
    experimentState.experimentSaved = false;
    document.getElementById('growthRunId').value = '';
    document.getElementById('experimentSaveStatus').textContent = 'Configure the next experiment.';
    document.getElementById('filledHolderSaveStatus').textContent = 'A holder loadout can be saved without a Growth Run ID.';
    document.getElementById('startNewExperimentButton').style.display = 'none';
    resetHolderSelection(true);
    await Promise.all([initialiseHolderSelect(), refreshSubstrateData()]);
    if (targetUpload) document.getElementById('targetUpload').value = targetUpload;
}


function updateCombinedId() {
    const element = document.getElementById('combinedId');
    if (experimentState.growthRunId && experimentState.holder) {
        element.textContent = experimentState.growthRunId + '@' + experimentState.holder.id;
    } else {
        element.textContent = '—';
    }
}


async function initialiseWorkflowV2() {
    loadUploads();
    initialiseSubstrateFilterEvents();
    await Promise.all([
        initialiseSubstrates(),
        initialiseTreatmentHistory(),
        initialiseHolderSelect()
    ]);
    updateStatePreview();
}

initialiseWorkflowV2();
