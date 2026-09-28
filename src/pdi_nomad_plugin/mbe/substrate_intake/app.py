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
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px;">
        <h1>Substrate Intake</h1>
        <p>PDI substrate intake dashboard is running.</p>
        <p>Next step: image upload, batch form and child-entry preview.</p>
      </body>
    </html>
    """
