function deploymentBase() {
    const path = window.location.pathname;
    const marker = '/dashboards/';
    const index = path.indexOf(marker);

    if (index >= 0) {
        return path.slice(0, index);
    }

    return '';
}

const base = deploymentBase();

const apps = {
    intake: {
        title: 'Substrate Intake',
        step: '01',
        accent: '#B78ACF',
        accentSoft: '#F2EAF7',
        url: base + '/dashboards/substrate-intake/'
    },
    processing: {
        title: 'Substrate Processing',
        step: '02',
        accent: '#A774C3',
        accentSoft: '#EDE1F4',
        url: base + '/dashboards/processing/'
    },
    experiment: {
        title: 'New MBE Experiment',
        step: '03',
        accent: '#9460B5',
        accentSoft: '#E7D7F0',
        url: base + '/dashboards/new-mbe-experiment/'
    },
    library: {
        title: 'Lab Library',
        step: '04',
        accent: '#6F3F92',
        accentSoft: '#DDC5E9',
        url: base + '/dashboards/lab-library/'
    }
};

const frame = document.getElementById('appFrame');
const loadingState = document.getElementById('loadingState');
const step = document.getElementById('workspaceStep');
const shell = document.documentElement;
const modeButton = document.getElementById('workspaceModeButton');

const fullPageUrl =
    base + '/dashboards/pdi-lab/';

const nomadDashboardUrl =
    base + '/gui/v2/dashboard/pdi-lab';

const embeddedInNomad =
    window.self !== window.top;

if (embeddedInNomad) {
    modeButton.textContent = '↗ Full page';
    modeButton.title = 'Open PDI Lab full page';

    modeButton.addEventListener('click', function() {
        window.open(
            fullPageUrl,
            '_blank',
            'noopener'
        );
    });
} else {
    modeButton.textContent = '← Back to NOMAD';
    modeButton.title = 'Return to NOMAD';

    modeButton.addEventListener('click', function() {
        window.location.href = nomadDashboardUrl;
    });
}

function selectApp(key, updateHistory = true) {
    const config = apps[key];

    if (!config) {
        return;
    }

    document.querySelectorAll('.nav-item').forEach(function(button) {
        button.classList.toggle(
            'active',
            button.dataset.app === key
        );
    });

    shell.style.setProperty('--accent', config.accent);
    shell.style.setProperty('--accent-soft', config.accentSoft);

    step.textContent = config.step + ' / 04';

    loadingState.classList.remove('hidden');

    if (frame.src !== new URL(config.url, window.location.href).href) {
        frame.src = config.url;
    }

    if (updateHistory) {
        history.replaceState(null, '', '#' + key);
    }
}

document.querySelectorAll('.nav-item').forEach(function(button) {
    button.addEventListener('click', function() {
        selectApp(button.dataset.app);
    });
});

frame.addEventListener('load', function() {
    loadingState.classList.add('hidden');
});

const initialKey = window.location.hash.slice(1);
selectApp(apps[initialKey] ? initialKey : 'intake', false);
