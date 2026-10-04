from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from nomad.config import config

BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / 'templates'
STATIC_DIR = BASE_DIR / 'static'

app = FastAPI()

LIBRARY_TYPES = {
    'processing_recipe': {
        'label': 'Processing Recipes',
        'kind': 'processing_recipe',
        'schemas': {
            'cleaning': {
                'label': 'Cleaning',
                'schema': 'pdi_nomad_plugin.general.schema.CleaningRecipePDI',
                'id_prefix': 'CLEAN',
                'usage_schemas': [
                    'pdi_nomad_plugin.general.schema.CleaningPDI',
                ],
            },
            'annealing': {
                'label': 'Annealing',
                'schema': 'pdi_nomad_plugin.general.schema.AnnealingRecipePDI',
                'id_prefix': 'ANNEAL',
                'usage_schemas': [
                    'pdi_nomad_plugin.general.schema.AnnealingPDI',
                ],
            },
            'etching': {
                'label': 'Etching',
                'schema': 'pdi_nomad_plugin.general.schema.EtchingRecipePDI',
                'id_prefix': 'ETCH',
                'usage_schemas': [
                    'pdi_nomad_plugin.general.schema.EtchingPDI',
                ],
            },
            'back_side_coating': {
                'label': 'Back-side coating',
                'schema': 'pdi_nomad_plugin.general.schema.BackSideCoatingRecipePDI',
                'id_prefix': 'BACKCOAT',
                'usage_schemas': [
                    'pdi_nomad_plugin.general.schema.BackSideCoatingPDI',
                ],
            },
        },
    },
    'sample_cut_recipe': {
        'label': 'Sample Cut Recipes',
        'schema': 'pdi_nomad_plugin.general.schema.SampleCutRecipePDI',
        'kind': 'sample_cut_recipe',
        'usage_schemas': [],
        'usage_note': (
            'Sample Cut execution copies recipe parameters into SampleCutPDI; '
            'the recipe is not referenced by the historical cut entry.'
        ),
    },
    'holder': {
        'label': 'Holders',
        'schema': 'pdi_nomad_plugin.mbe.instrument.SubstrateHolderPDI',
        'kind': 'holder',
        'usage_schemas': [
            'pdi_nomad_plugin.mbe.instrument.FilledSubstrateHolderPDI',
        ],
    },
    'insert': {
        'label': 'Inserts',
        'schema': 'pdi_nomad_plugin.mbe.instrument.InsertReductionPDI',
        'kind': 'insert',
        'usage_schemas': [
            'pdi_nomad_plugin.mbe.instrument.FilledSubstrateHolderPDI',
        ],
    },
}


@app.get('/library-types')
async def library_types():
    return LIBRARY_TYPES


@app.get('/', response_class=HTMLResponse)
async def index():
    html = (TEMPLATE_DIR / 'index.html').read_text(encoding='utf-8')
    api_base = config.services.api_base_path.rstrip('/') + '/api/v1'
    injection = f'<script>window.NOMAD_API_BASE = {api_base!r};</script>'
    return html.replace(
        '<script src="static/app.js"></script>',
        injection + '<script src="static/app.js"></script>',
        1,
    )


@app.get('/static/styles.css')
async def styles():
    return FileResponse(STATIC_DIR / 'styles.css', media_type='text/css')


@app.get('/static/app.js')
async def javascript():
    return FileResponse(
        STATIC_DIR / 'app.js',
        media_type='application/javascript',
    )
