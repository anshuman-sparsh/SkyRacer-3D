import { HANGAR_AIRCRAFT, HANGAR_MILESTONES } from '../hangar/HangarCatalog.js';
import { HangarPreview } from '../hangar/HangarPreview.js';

/**
 * M5-B: independent pre-flight Hangar with 3D aircraft preview.
 * Both free starters are equipable; advanced aircraft remain locked until M5-C.
 */
export class HangarPanel {
    constructor({ getTheme, canOpen, selection }) {
        this.selection = selection;
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
        this.canvas = document.querySelector('[data-hangar-canvas]');
        this.viewer = new HangarPreview(this.canvas);
        this.equipButton = document.querySelector('[data-hangar-equip]');
        this.matchButton = document.querySelector('[data-hangar-match]');
        this.selectedStatus = document.querySelector('[data-hangar-selected-state]');
        this.previewId = selection.activeId;
        this.tab = 'aircraft';

        this.handleOpen = () => this.open();
        this.handleClose = () => this.dialog.close();
        this.handleDialogClose = () => {
            this.viewer.close();
            if (!this.trigger.hidden && !this.entry.hidden) {
                this.trigger.focus({ preventScroll: true });
            }
        };
        this.handleAircraft = () => this.setTab('aircraft');
        this.handleEquip = () => { if (this.selection.choose(this.previewId)) this.refresh(); };
        this.handleMatch = () => { this.selection.choose('match-theme'); this.previewId = this.selection.activeId; this.refresh(); };
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
        this.equipButton.addEventListener('click',this.handleEquip);
        this.matchButton.addEventListener('click',this.handleMatch);
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
        const equipped = this.selection.activeId;
        const equippedAircraft = HANGAR_AIRCRAFT.find(a=>a.id===equipped);
        const chosen = HANGAR_AIRCRAFT.find(a=>a.id===this.previewId) || equippedAircraft;
        this.entryAircraft.textContent = equippedAircraft.name;
        this.defaultName.textContent = chosen.name;
        this.preview.dataset.aircraft = chosen.id;
        this.viewer.setAircraft(chosen.id);
        const owned = chosen.tier === 'Starter';
        this.equipButton.disabled = !owned || chosen.id === equipped;
        this.equipButton.textContent = !owned ? 'LOCKED · EARN IN M5-C'
            : chosen.id === equipped ? 'EQUIPPED' : 'EQUIP AIRCRAFT';
        this.matchButton.disabled = this.selection.preference === 'match-theme';
        this.selectedStatus.textContent = this.selection.preference === 'match-theme'
            ? 'MATCH THEME · ACTIVE' : 'MANUALLY SELECTED · ' + equippedAircraft.name;
        for (const item of this.collection.children) {
            const current = item.dataset.aircraft === equipped;
            item.classList.toggle('is-theme-default',current);
            item.classList.toggle('is-preview',item.dataset.aircraft === chosen.id);
            const label = item.querySelector('[data-hangar-theme-default]');
            if(label)label.hidden = !current;
        }
    }

    selectPreview(id) {
        if (!HANGAR_AIRCRAFT.some(a=>a.id===id))return;
        this.previewId=id;
        this.refresh();
    }

    open() {
        if (this.dialog.open || !this.canOpen()) return false;
        this.previewId = this.selection.activeId;
        this.refresh();
        this.setTab('aircraft');
        this.dialog.showModal();
        this.viewer.open(this.previewId);
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
            tier.textContent = aircraft.tier === 'Starter' ? 'FREE · EQUIPABLE' : aircraft.tier + ' · LOCKED';
            const requirement = document.createElement('p');
            requirement.textContent = aircraft.requirement;
            const label = document.createElement('span');
            label.className = 'hangar-aircraft__default';
            label.dataset.hangarThemeDefault = '';
            label.textContent = 'Equipped';
            label.hidden = true;
            details.append(heading, tier, requirement, label);
            const inspect = document.createElement('button');
            inspect.type = 'button';
            inspect.className = 'hangar-aircraft__inspect';
            inspect.textContent = 'PREVIEW';
            inspect.setAttribute('aria-label', 'Preview ' + aircraft.name);
            inspect.addEventListener('click',()=>this.selectPreview(aircraft.id));
            item.append(marker, details, inspect);
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
        this.equipButton.removeEventListener('click',this.handleEquip);
        this.matchButton.removeEventListener('click',this.handleMatch);
        this.viewer.dispose();
        this.aircraftTab.removeEventListener('click', this.handleAircraft);
        this.achievementsTab.removeEventListener('click', this.handleAchievements);
        this.aircraftTab.removeEventListener('keydown', this.handleTabKeys);
        this.achievementsTab.removeEventListener('keydown', this.handleTabKeys);
    }
}
