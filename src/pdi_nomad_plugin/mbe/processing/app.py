from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse

BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / 'templates'
STATIC_DIR = BASE_DIR / 'static'

app = FastAPI()


PROCESS_TYPES = {
    'cleaning': {
        'label': 'Cleaning',
        'schema': 'pdi_nomad_plugin.general.schema.CleaningRecipePDI',
        'processSchema': 'pdi_nomad_plugin.general.schema.CleaningPDI',
    },
    'annealing': {
        'label': 'Annealing',
        'schema': 'pdi_nomad_plugin.general.schema.AnnealingRecipePDI',
        'processSchema': 'pdi_nomad_plugin.general.schema.AnnealingPDI',
    },
    'etching': {
        'label': 'Etching',
        'schema': 'pdi_nomad_plugin.general.schema.EtchingRecipePDI',
        'processSchema': 'pdi_nomad_plugin.general.schema.EtchingPDI',
    },
    'back_side_coating': {
        'label': 'Back-side coating',
        'schema': 'pdi_nomad_plugin.general.schema.BackSideCoatingRecipePDI',
        'processSchema': 'pdi_nomad_plugin.general.schema.BackSideCoatingPDI',
    },
}


@app.get('/process-types')
async def process_types():
    return PROCESS_TYPES


@app.get('/', response_class=HTMLResponse)
async def index():
    return (TEMPLATE_DIR / 'index.html').read_text(encoding='utf-8')


@app.get('/static/styles.css')
async def styles():
    return FileResponse(STATIC_DIR / 'styles.css', media_type='text/css')


@app.get('/static/app.js')
async def javascript():
    return FileResponse(
        STATIC_DIR / 'app.js',
        media_type='application/javascript',
    )
