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
        accent: '#138b8b',
        accentSoft: '#e6f5f4',
        url: base + '/dashboards/substrate-intake/'
    },
    search: {
        title: 'Substrate Search',
        step: '02',
        accent: '#3178b9',
        accentSoft: '#eaf2fa',
        url: base + '/gui/search/substrateapp'
    },
    processing: {
        title: 'Processing',
        step: '03',
        accent: '#d47a24',
        accentSoft: '#fff1e4',
        url: base + '/dashboards/processing/'
    },
    experiment: {
        title: 'New MBE Experiment',
        step: '04',
        accent: '#7656b5',
        accentSoft: '#f0ebfa',
        url: base + '/dashboards/new-mbe-experiment/'
    },
    library: {
        title: 'Lab Library',
        step: '05',
        accent: '#4a8b63',
        accentSoft: '#eaf5ee',
        url: base + '/dashboards/lab-library/'
    }
};

const frame = document.getElementById('appFrame');
const loadingState = document.getElementById('loadingState');
const title = document.getElementById('workspaceTitle');
const step = document.getElementById('workspaceStep');
const shell = document.documentElement;

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

    title.textContent = config.title;
    step.textContent = 'Workflow ' + config.step + ' / 05';

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
