from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from nomad.utils import hash as nomad_hash

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = BASE_DIR / 'templates'
STATIC_DIR = BASE_DIR / 'static'


@app.get('/api/entry-id')
async def calculate_entry_id(
    upload_id: str,
    filename: str,
):
    return {
        'entry_id': nomad_hash(
            upload_id,
            filename,
        )
    }


@app.get('/', response_class=HTMLResponse)
async def index():
    return (TEMPLATE_DIR / 'index.html').read_text(encoding='utf-8')


@app.get('/static/styles.css')
async def styles():
    return FileResponse(
        STATIC_DIR / 'styles.css',
        media_type='text/css',
    )


@app.get('/static/app.js')
async def javascript():
    return FileResponse(
        STATIC_DIR / 'app.js',
        media_type='application/javascript',
    )
