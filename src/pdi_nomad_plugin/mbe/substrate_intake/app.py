from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()


@app.get('/', response_class=HTMLResponse)
async def index():
    return """
    <!doctype html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Substrate Intake</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                background: #f5f6f8;
                color: #222;
            }

            .page {
                max-width: 1500px;
                margin: 0 auto;
                padding: 24px;
            }

            h1 {
                margin-top: 0;
            }

            .layout {
                display: grid;
                grid-template-columns: 1fr 1.4fr 1fr;
                gap: 20px;
                align-items: start;
            }

            .card {
                background: white;
                border: 1px solid #d9dde3;
                border-radius: 8px;
                padding: 18px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            }

            .card h2 {
                margin-top: 0;
                font-size: 18px;
            }

            label {
                display: block;
                margin-top: 12px;
                margin-bottom: 4px;
                font-size: 13px;
                font-weight: bold;
            }

            input, textarea {
                width: 100%;
                box-sizing: border-box;
                padding: 8px 10px;
                border: 1px solid #bfc5cc;
                border-radius: 5px;
                font-size: 14px;
            }

            textarea {
                min-height: 90px;
                resize: vertical;
            }

            button {
                padding: 9px 14px;
                border: 0;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
            }

            .primary {
                background: #1976d2;
                color: white;
            }

            .secondary {
                background: #eceff3;
                color: #222;
            }

            .upload-box {
                border: 2px dashed #b7bec8;
                border-radius: 8px;
                padding: 24px;
                text-align: center;
                background: #fafbfc;
            }

            .preview {
                margin-top: 12px;
                max-height: 520px;
                overflow-y: auto;
                border: 1px solid #e0e3e7;
                border-radius: 6px;
                background: #fafafa;
            }

            .preview-item {
                padding: 8px 10px;
                border-bottom: 1px solid #e3e6ea;
                font-family: monospace;
                font-size: 13px;
            }

            .preview-item:last-child {
                border-bottom: none;
            }

            .summary {
                padding: 10px;
                background: #eef4fb;
                border-radius: 6px;
                margin-bottom: 12px;
                font-size: 13px;
            }

            .small {
                font-size: 12px;
                color: #666;
            }
        </style>
    </head>

    <body>
        <div class="page">
            <h1>Substrate Intake</h1>
            <p>Create a substrate batch and preview the individual substrate entries.</p>

            <div class="layout">

                <div class="card">
                    <h2>1. Box label</h2>

                    <div class="upload-box">
                        <p><strong>Substrate box image</strong></p>
                        <p class="small">
                            Later this will be used for OCR-assisted prefilling.
                        </p>
                        <button class="secondary" type="button">
                            Load from image
                        </button>
                    </div>

                    <p class="small" style="margin-top:16px;">
                        Expected label information:
                        supplier, material, orientation, offcut,
                        batch/charge ID and substrate count.
                    </p>
                </div>


                <div class="card">
                    <h2>2. Batch data</h2>

                    <label for="supplier">Supplier</label>
                    <input id="supplier" placeholder="e.g. CTC">

                    <label for="material">Material / Crystal</label>
                    <input id="material" placeholder="e.g. SrTiO3">

                    <label for="orientation">Orientation</label>
                    <input id="orientation" placeholder="e.g. (001)">

                    <label for="offcut_angle">Offcut angle</label>
                    <input id="offcut_angle" placeholder="e.g. 0.1°">

                    <label for="offcut_direction">Offcut direction</label>
                    <input id="offcut_direction" placeholder="e.g. towards [100]">

                    <label for="charge">Charge / Batch ID</label>
                    <input id="charge" placeholder="e.g. 0228-0025-25-MN2490">

                    <label for="dimensions">Dimensions</label>
                    <input id="dimensions" placeholder="e.g. 10 x 10 x 0.5 mm">

                    <label for="count">Number of substrates</label>
                    <input
                        id="count"
                        type="number"
                        min="1"
                        value="10"
                        oninput="updatePreview()"
                    >

                    <label for="notes">Notes</label>
                    <textarea id="notes"></textarea>
                </div>


                <div class="card">
                    <h2>3. Archive preview</h2>

                    <div class="summary">
                        <strong>Batch entry:</strong><br>
                        <span id="batchPreview">SubstrateBatchMbe</span>
                    </div>

                    <div>
                        <strong>Child entries</strong>
                    </div>

                    <div id="childPreview" class="preview"></div>

                    <button
                        class="primary"
                        type="button"
                        style="margin-top:16px; width:100%;"
                        disabled
                    >
                        Save to NOMAD
                    </button>

                    <p class="small">
                        Save is disabled in this first UI prototype.
                    </p>
                </div>

            </div>
        </div>
        <script>
            function cleanPart(value) {
                return value
                    .trim()
                    .replace(/\\s+/g, '_')
                    .replace(/[^A-Za-z0-9._-]/g, '');
            }

            function updatePreview() {
                const supplier = cleanPart(
                    document.getElementById('supplier').value
                );
                const material = cleanPart(
                    document.getElementById('material').value
                );
                const charge = cleanPart(
                    document.getElementById('charge').value
                );

                const countInput = document.getElementById('count');
                const preview = document.getElementById('childPreview');
                const batchPreview = document.getElementById('batchPreview');

                let count = parseInt(countInput.value || '0', 10);

                if (count < 0 || Number.isNaN(count)) {
                    count = 0;
                }

                const parts = [supplier, material, charge].filter(Boolean);
                const batchName = parts.length
                    ? parts.join('_')
                    : 'SubstrateBatchMbe';

                batchPreview.textContent = batchName;
                preview.innerHTML = '';

                for (let i = 1; i <= count; i++) {
                    const item = document.createElement('div');
                    item.className = 'preview-item';
                    item.textContent = batchName + '_' + i;
                    preview.appendChild(item);
                }
            }

            [
                'supplier',
                'material',
                'charge',
                'count'
            ].forEach(function(id) {
                document
                    .getElementById(id)
                    .addEventListener('input', updatePreview);
            });

            updatePreview();
        </script>
    </body>
    </html>
    """
