import {
    HANGAR_AIRCRAFT, HANGAR_MILESTONES, aircraftForTheme, themeDefaultAircraft,
} from '../hangar/HangarCatalog.js';

/**
 * M5-A: independent pre-flight Hangar foundation.
 * This is deliberately a concept/collection preview; equipping actual
 * procedural models belongs to M5-B and verified progress to M5-C.
 */
export class HangarPanel {
    constructor({ getTheme, canOpen }) {
        this.getTheme = getTheme;
        this.canOpen = canOpen;
        this.entry = document.querySelector('[data-hangar-entry]');
        this.trigger = document.querySelector('[data-hangar-open]');
        this.entryAircraft = document.querySelector('[data-hangar-current]');
        this.dialog = document.querySelector('[data-hangar-dialog]');
        this.closeButton = document.querySelector('[data-hangar-close]');
        this.aircraftTab = document.querySelector('[data-hangar-tab-aircraft]');
        this.achievementsTab = document.querySelector('[data-hangar-tab-achievements]');
        this.aircraftPanel = document.querySelector('[data-hangar-panel-aircraft]');
        this.achievementsPanel = document.querySelector('[data-hangar-panel-achievements]');
        this.collection = document.querySelector('[data-hangar-collection]');
        this.achievements = document.querySelector('[data-hangar-achievements]');
        this.defaultName = document.querySelector('[data-hangar-default-name]');
        this.preview = document.querySelector('[data-hangar-preview]');
        this.tab = 'aircraft';

        this.handleOpen = () => this.open();
        this.handleClose = () => this.dialog.close();
        this.handleDialogClose = () => {
            if (!this.trigger.hidden && !this.entry.hidden) {
                this.trigger.focus({ preventScroll: true });
            }
        };
        this.handleAircraft = () => this.setTab('aircraft');
        this.handleAchievements = () => this.setTab('achievements');
        this.handleTabKeys = event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            this.setTab(event.key === 'Home' || event.key === 'ArrowLeft'
                ? 'aircraft' : 'achievements');
            (this.tab === 'aircraft' ? this.aircraftTab : this.achievementsTab)
                .focus({ preventScroll: true });
        };
        this.trigger.addEventListener('click', this.handleOpen);
        this.closeButton.addEventListener('click', this.handleClose);
        this.dialog.addEventListener('close', this.handleDialogClose);
        this.aircraftTab.addEventListener('click', this.handleAircraft);
        this.achievementsTab.addEventListener('click', this.handleAchievements);
        this.aircraftTab.addEventListener('keydown', this.handleTabKeys);
        this.achievementsTab.addEventListener('keydown', this.handleTabKeys);

        this.renderCollection();
        this.renderAchievements();
        this.setTab('aircraft');
        this.refresh();
    }

    setAvailable(isAvailable) {
        this.entry.hidden = !isAvailable;
        this.trigger.disabled = !isAvailable;
    }

    refresh() {
        const theme = this.getTheme();
        const aircraft = aircraftForTheme(theme);
        this.entryAircraft.textContent = aircraft.name;
        this.defaultName.textContent = aircraft.name;
        this.preview.dataset.aircraft = themeDefaultAircraft(theme);
        const selectedId = aircraft.id;
        for (const item of this.collection.children) {
            item.classList.toggle('is-theme-default', item.dataset.aircraft === selectedId);
            const defaultLabel = item.querySelector('[data-hangar-theme-default]');
            if (defaultLabel) defaultLabel.hidden = item.dataset.aircraft !== selectedId;
        }
    }

    open() {
        if (this.dialog.open || !this.canOpen()) return false;
        this.refresh();
        this.setTab('aircraft');
        this.dialog.showModal();
        this.closeButton.focus({ preventScroll: true });
        return true;
    }

    setTab(tab) {
        this.tab = tab === 'achievements' ? 'achievements' : 'aircraft';
        const aircraftSelected = this.tab === 'aircraft';
        this.aircraftTab.setAttribute('aria-selected', String(aircraftSelected));
        this.achievementsTab.setAttribute('aria-selected', String(!aircraftSelected));
        this.aircraftTab.tabIndex = aircraftSelected ? 0 : -1;
        this.achievementsTab.tabIndex = aircraftSelected ? -1 : 0;
        this.aircraftPanel.hidden = !aircraftSelected;
        this.achievementsPanel.hidden = aircraftSelected;
    }

    renderCollection() {
        const fragment = document.createDocumentFragment();
        for (const aircraft of HANGAR_AIRCRAFT) {
            const item = document.createElement('article');
            item.className = 'hangar-aircraft';
            item.dataset.aircraft = aircraft.id;
            const marker = document.createElement('span');
            marker.className = 'hangar-aircraft__marker';
            marker.dataset.color = aircraft.color;
            marker.setAttribute('aria-hidden', 'true');
            const details = document.createElement('div');
            details.className = 'hangar-aircraft__details';
            const heading = document.createElement('h3');
            heading.textContent = aircraft.name;
            const tier = document.createElement('p');
            tier.className = 'hangar-aircraft__tier';
            tier.textContent = aircraft.tier + ' · Planned';
            const requirement = document.createElement('p');
            requirement.textContent = aircraft.requirement;
            const label = document.createElement('span');
            label.className = 'hangar-aircraft__default';
            label.dataset.hangarThemeDefault = '';
            label.textContent = 'Theme default (planned)';
            label.hidden = true;
            details.append(heading, tier, requirement, label);
            item.append(marker, details);
            fragment.append(item);
        }
        this.collection.append(fragment);
    }

    renderAchievements() {
        const fragment = document.createDocumentFragment();
        for (const milestone of HANGAR_MILESTONES) {
            const item = document.createElement('li');
            const title = document.createElement('strong');
            title.textContent = milestone.title;
            const description = document.createElement('span');
            description.textContent = milestone.criterion;
            item.append(title, description);
            fragment.append(item);
        }
        this.achievements.append(fragment);
    }

    dispose() {
        this.trigger.removeEventListener('click', this.handleOpen);
        this.closeButton.removeEventListener('click', this.handleClose);
        this.dialog.removeEventListener('close', this.handleDialogClose);
        this.aircraftTab.removeEventListener('click', this.handleAircraft);
        this.achievementsTab.removeEventListener('click', this.handleAchievements);
        this.aircraftTab.removeEventListener('keydown', this.handleTabKeys);
        this.achievementsTab.removeEventListener('keydown', this.handleTabKeys);
    }
}
