"""Integration contracts for the shared PDI substrate geometry representation."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / 'src/pdi_nomad_plugin/general/schema.py'
INTAKE = ROOT / 'src/pdi_nomad_plugin/mbe/substrate_intake/app.py'
CUTTING = ROOT / 'src/pdi_nomad_plugin/mbe/processing/static/app.js'
EXPERIMENT = ROOT / 'src/pdi_nomad_plugin/mbe/new_mbe_experiment/static/app.js'


def test_shared_schema_contract():
    source = SCHEMA.read_text(encoding='utf-8')
    assert 'class SubstrateGeometryPDI(Geometry)' in source
    assert 'class SampleCutGeometryPDI(SubstrateGeometryPDI)' in source
    for name in ('shape', 'width', 'length', 'height', 'radius', 'central_angle'):
        assert f'    {name} = Quantity(' in source


def test_intake_and_consumers_reference_the_same_schema():
    schema_path = 'pdi_nomad_plugin.general.schema.SubstrateGeometryPDI'
    assert schema_path in INTAKE.read_text(encoding='utf-8')
    assert schema_path in CUTTING.read_text(encoding='utf-8')
    experiment = EXPERIMENT.read_text(encoding='utf-8')
    assert 'function substrateFootprint(' in experiment
    assert 'function geometryFits(' in experiment
    assert 'return false;\n    }\n\n    if (!substrateFootprint(substrate.geometry))' in experiment
