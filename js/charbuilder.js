/* global Renderer, localforage, MiscUtil, DataUtil, BrewUtil2, PrereleaseUtil, FilterBox, SourceFilter, FILTER_BOX_EVNT_VALCHANGE */
import { I18n } from "./i18n.js";
"use strict";

const CB_STORAGE_KEY = "rpgmartins_cb_active_v11";
const DB_NAME = "rpgmartins_5etools";
const DB_STORE = "characters_v1";

const isSrdish = (ent) => !!(ent?.srd || ent?.basicRules || ent?.srd52 || ent?.basicRules2024);
const normArr = (it) => it == null ? [] : (Array.isArray(it) ? it : [it]);

const saveState = (st) => { try { localStorage.setItem(CB_STORAGE_KEY, JSON.stringify(st)); } catch (e) {} };
const loadState = () => { try { const raw = localStorage.getItem(CB_STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };

const getUid = () => { try { return crypto.randomUUID(); } catch { return `cb_${Date.now()}_${Math.random().toString(16).slice(2)}`; } };

const toast = (msg, type = "info") => {
	if (window.JqueryUtil?.doToast) return window.JqueryUtil.doToast({content: msg, type});
	alert(msg);
};

class CharacterBuilderApp {
	constructor () {
		const st = loadState() || {
			meta: { name: "", isSrdOnly: true, activeTab: "species", editId: null },
			choice: { species: null, subrace: null, cls: null, subclass: null, background: null, feats: [] },
		};

		st.meta = st.meta || {};
		st.meta.editId = st.meta.editId || null;

		this._state = st;

		this._data = {
			races: [],
			classes: [],
			subclasses: [],
			classFeatures: [],
			subclassFeatures: [],
			backgrounds: [],
			feats: [],
		};

		this._raceGroups = new Map();
		this._speciesVm = [];

		this._classFeatureByUid = new Map();
		this._subclassFeatureByUid = new Map();

		// filtros padrão 5etools
		this._sourceFilter = null;
		this._filterBox = null;

		this._els = {};
		this._listVm = [];

		this._db = localforage.createInstance({ name: DB_NAME, storeName: DB_STORE });
	}

	async pInit () {
		this._cacheElements();
		this._bindEvents();
		this._syncControlsFromState();

		this._renderPreviewDefault("Carregando dados...");
		await I18n.pInit({ lang: "ptbr" });
		await this._pLoadAllData();
		I18n.patchInPlaceData(this._data);
		await this._pInitFilters5etools();

		this._syncTabDisables();
		this._renderAll();
		this._renderPreviewDefault();
	}

	_cacheElements () {
		this._els.tabs = document.getElementById("cb__tabs");
		this._els.toggleSrd = document.getElementById("cb__toggle_srd");
		this._els.list = document.getElementById("cb__list");

		this._els.name = document.getElementById("cb__name");
		this._els.chips = document.getElementById("cb__chips");

		this._els.previewTbl = document.getElementById("cb__preview_tbl");

		this._els.btnSaveNew = document.getElementById("cb__btn_save_new");
		this._els.btnUpdate = document.getElementById("cb__btn_update");
		this._els.btnReset = document.getElementById("cb__btn_reset");

		this._els.noticeSrd = document.getElementById("cb__notice_srd");

		this._els.btnFilterOpen = document.getElementById("cb__btn_filter_open");
		this._els.btnFilterReset = document.getElementById("cb__btn_filter_reset");
		this._els.wrpFilterPills = document.getElementById("cb__wrp_filter_pills");
	}

	_bindEvents () {
		this._els.tabs.addEventListener("click", (evt) => {
			const btn = evt.target.closest("button[data-cb-tab]");
			if (!btn || btn.disabled) return;
			this._state.meta.activeTab = btn.dataset.cbTab;
			saveState(this._state);
			this._syncTabs();
			this._renderList();
			this._renderPreviewDefault();
		});

		this._els.toggleSrd.addEventListener("change", () => {
			this._state.meta.isSrdOnly = !!this._els.toggleSrd.checked;
			saveState(this._state);
			this._syncTabDisables();
			this._renderAll();
			this._updateSrdNotice();
			this._renderPreviewDefault();
		});

		this._els.name.addEventListener("input", () => {
			this._state.meta.name = this._els.name.value || "";
			saveState(this._state);
			this._renderChips();
		});

		this._els.btnReset.addEventListener("click", () => {
			localStorage.removeItem(CB_STORAGE_KEY);
			location.reload();
		});

		this._els.btnSaveNew.addEventListener("click", async () => {
			await this._pSaveAsNew();
		});

		this._els.btnUpdate.addEventListener("click", async () => {
			await this._pUpdateExisting();
		});

		this._els.list.addEventListener("click", (evt) => {
			const row = evt.target.closest("[data-cb-ix]");
			if (!row) return;
			this._onClickListItem(Number(row.dataset.cbIx));
		});
	}

	_updateSrdNotice () {
		if (!this._els.noticeSrd) return;
		this._els.noticeSrd.classList.toggle("cb__notice--hidden", !this._state.meta.isSrdOnly);
	}

	_updateSaveButtons () {
		const hasEditId = !!this._state.meta.editId;
		this._els.btnUpdate.disabled = !hasEditId;
	}

	_syncControlsFromState () {
		this._els.name.value = this._state.meta.name || "";
		this._els.toggleSrd.checked = !!this._state.meta.isSrdOnly;
		this._syncTabs();
		this._updateSrdNotice();
		this._updateSaveButtons();
	}

	_syncTabs () {
		const active = this._state.meta.activeTab;
		[...this._els.tabs.querySelectorAll("button[data-cb-tab]")].forEach(btn => {
			btn.classList.toggle("ve-active", btn.dataset.cbTab === active);
		});
	}

	_setTabDisabled (tabKey, isDisabled) {
		const btn = this._els.tabs.querySelector(`button[data-cb-tab="${tabKey}"]`);
		if (!btn) return;
		btn.disabled = !!isDisabled;
	}

	// =========================
	// Data + Brew/Prerelease
	// =========================
	async _pLoadAllData () {
		await Promise.allSettled([
			PrereleaseUtil?.pInit?.(),
			BrewUtil2?.pInit?.(),
		]);

		const racesJson = await fetch("data/races.json").then(r => r.json());
		this._data.races = normArr(racesJson.race);

		const bgsJson = await fetch("data/backgrounds.json").then(r => r.json());
		this._data.backgrounds = normArr(bgsJson.background);

		const featsJson = await fetch("data/feats.json").then(r => r.json());
		this._data.feats = normArr(featsJson.feat);

		const clsIndex = await fetch("data/class/index.json").then(r => r.json());
		const clsFiles = Object.values(clsIndex);
		const clsDatas = await Promise.all(clsFiles.map(fn => fetch(`data/class/${fn}`).then(r => r.json())));

		const classes = [];
		const subclasses = [];
		const classFeatures = [];
		const subclassFeatures = [];

		clsDatas.forEach(d => {
			normArr(d.class).forEach(it => classes.push(it));
			normArr(d.subclass).forEach(it => subclasses.push(it));
			normArr(d.classFeature).forEach(it => classFeatures.push(it));
			normArr(d.subclassFeature).forEach(it => subclassFeatures.push(it));
		});

		this._data.classes = classes;
		this._data.subclasses = subclasses;
		this._data.classFeatures = classFeatures;
		this._data.subclassFeatures = subclassFeatures;

		await this._pMergeBrewAndPrerelease();

		this._rebuildRaceGroups();
		this._rebuildFeatureLookups();
	}

	async _pMergeBrewAndPrerelease () {
		const merge = (obj) => {
			if (!obj) return;
			this._data.races.push(...normArr(obj.race));
			this._data.classes.push(...normArr(obj.class));
			this._data.subclasses.push(...normArr(obj.subclass));
			this._data.backgrounds.push(...normArr(obj.background));
			this._data.feats.push(...normArr(obj.feat));
			this._data.classFeatures.push(...normArr(obj.classFeature));
			this._data.subclassFeatures.push(...normArr(obj.subclassFeature));
		};

		try {
			if (PrereleaseUtil?.pGetBrewProcessed) merge(await PrereleaseUtil.pGetBrewProcessed());
		} catch (e) { console.warn("[charbuilder] prerelease merge failed:", e); }

		try {
			if (BrewUtil2?.pGetBrewProcessed) merge(await BrewUtil2.pGetBrewProcessed());
		} catch (e) { console.warn("[charbuilder] brew merge failed:", e); }
	}

	_raceKey (name, source) { return `${name}||${source}`; }

	_rebuildRaceGroups () {
		this._raceGroups = new Map();

		for (const r of this._data.races) {
			if (r.raceName && r.name) {
				const parentName = r.raceName;
				const parentSource = r.raceSource || r.source;
				const k = this._raceKey(parentName, parentSource);
				const grp = this._raceGroups.get(k) || {name: parentName, source: parentSource, baseEnt: null, subEnts: []};
				grp.subEnts.push(r);
				this._raceGroups.set(k, grp);
				continue;
			}

			const baseName = r.name || r.raceName;
			const baseSource = r.source || r.raceSource;
			if (!baseName || !baseSource) continue;

			const k = this._raceKey(baseName, baseSource);
			const grp = this._raceGroups.get(k) || {name: baseName, source: baseSource, baseEnt: null, subEnts: []};
			grp.baseEnt = r;
			this._raceGroups.set(k, grp);
		}

		for (const grp of this._raceGroups.values()) {
			if (grp.baseEnt) continue;
			grp.baseEnt = { name: grp.name, source: grp.source, entries: [{type: "quote", entries: ["(Base ausente no JSON; exibindo por agrupamento.)"]}] };
		}

		this._speciesVm = [...this._raceGroups.values()]
			.sort((a, b) => (a.name.localeCompare(b.name) || a.source.localeCompare(b.source)))
			.map(grp => ({ _kind: "species", name: grp.name, source: grp.source, _ent: grp.baseEnt }));
	}

	_rebuildFeatureLookups () {
		this._classFeatureByUid = new Map();
		for (const f of this._data.classFeatures) {
			try { this._classFeatureByUid.set(DataUtil.class.packUidClassFeature(f), f); } catch {}
		}

		this._subclassFeatureByUid = new Map();
		for (const f of this._data.subclassFeatures) {
			try { this._subclassFeatureByUid.set(DataUtil.class.packUidSubclassFeature(f), f); } catch {}
		}
	}

	// =========================
	// ✅ 5etools FilterBox/SourceFilter
	// =========================
	async _pInitFilters5etools () {
		const srcSet = new Set();
		const addSrc = (it) => { if (it?.source) srcSet.add(it.source); };

		this._data.races.forEach(addSrc);
		this._data.classes.forEach(addSrc);
		this._data.subclasses.forEach(addSrc);
		this._data.backgrounds.forEach(addSrc);
		this._data.feats.forEach(addSrc);

		this._sourceFilter = new SourceFilter();
		this._sourceFilter.addItem([...srcSet]);

		const btnOpen = e_({ ele: this._els.btnFilterOpen });
		const btnReset = e_({ ele: this._els.btnFilterReset });
		const wrpMiniPills = e_({ ele: this._els.wrpFilterPills });

		this._filterBox = new FilterBox({
			btnOpen,
			btnReset,
			wrpMiniPills,
			filters: [this._sourceFilter],
			isCompact: true,
			namespace: "charbuilder",
			namespaceSnapshots: "charbuilder",
		});

		await this._filterBox.pDoLoadState();
		this._filterBox.render();

		this._filterBox.on(FILTER_BOX_EVNT_VALCHANGE, () => {
			this._syncTabDisables();
			this._renderList();
			this._renderPreviewDefault();
		});
	}

	_isAllowedByFilters (ent) {
		if (this._state.meta.isSrdOnly && !isSrdish(ent)) return false;
		if (!this._filterBox || !this._sourceFilter) return true;

		const vals = this._filterBox.getValues();
		const srcVal = SourceFilter.getCompleteFilterSources
			? SourceFilter.getCompleteFilterSources(ent)
			: ent.source;

		return this._sourceFilter.toDisplay(vals, srcVal);
	}

	// =========================
	// UI list plumbing
	// =========================
	_getLineagesFromXphb (baseEnt) {
		if (!baseEnt || baseEnt.source !== "XPHB") return [];
		const vers = normArr(baseEnt._versions);
		if (!vers.length) return [];
		const prefix = `${baseEnt.name};`;
		return vers
			.filter(v => (v.source || baseEnt.source) === baseEnt.source && (v.name || "").startsWith(prefix))
			.map(v => {
				let nm = v.name.slice(prefix.length).trim();
				nm = nm.replace(/\bLineage\b/i, "").trim();
				nm = nm.replace(/^\s*;\s*/g, "").trim();
				return { __isLineage: true, name: nm || v.name, source: baseEnt.source, _versionName: v.name };
			});
	}

	_getSubracesRaw (species) {
		const grp = this._raceGroups.get(this._raceKey(species.name, species.source));
		if (!grp) return [];
		if (grp.subEnts?.length) return grp.subEnts.sort((a, b) => a.name.localeCompare(b.name));
		return this._getLineagesFromXphb(grp.baseEnt);
	}

	_getSubclassesRaw (cls) {
		let out = this._data.subclasses.filter(sc => sc.className === cls.name && sc.classSource === cls.source);
		if (!out.length && cls.source === "XPHB") out = this._data.subclasses.filter(sc => sc.className === cls.name && sc.classSource === "PHB");
		return out.sort((a, b) => a.name.localeCompare(b.name));
	}

	_syncTabDisables () {
		const sp = this._state.choice.species;
		const subracesRaw = sp ? this._getSubracesRaw(sp) : [];
		this._setTabDisabled("subrace", subracesRaw.length === 0);

		const cl = this._state.choice.cls;
		const subclassesRaw = cl ? this._getSubclassesRaw(cl) : [];
		this._setTabDisabled("subclass", subclassesRaw.length === 0);

		if (this._state.meta.activeTab === "subrace" && subracesRaw.length === 0) this._goTab("species");
		if (this._state.meta.activeTab === "subclass" && subclassesRaw.length === 0) this._goTab("class");
	}

	_goTab (tabKey) {
		this._state.meta.activeTab = tabKey;
		saveState(this._state);
		this._syncTabs();
		this._renderList();
		this._renderPreviewDefault();
	}

	_renderAll () {
		this._renderList();
		this._renderChips();
		this._updateSrdNotice();
		this._updateSaveButtons();
	}

	_getTabKey () { return this._state.meta.activeTab; }

	_getFilteredListForActiveTab () {
		const tab = this._getTabKey();

		if (tab === "species") return this._speciesVm.filter(it => this._isAllowedByFilters(it._ent));

		if (tab === "subrace") {
			const sp = this._state.choice.species;
			if (!sp) return [];
			return this._getSubracesRaw(sp).filter(sr => this._isAllowedByFilters(sr))
				.map(r => ({ _kind: "subrace", name: r.name, source: r.source, _ent: r }));
		}

		if (tab === "class") {
			return this._data.classes.filter(c => this._isAllowedByFilters(c))
				.map(c => ({ _kind: "class", name: c.name, source: c.source, _ent: c }));
		}

		if (tab === "subclass") {
			const cl = this._state.choice.cls;
			if (!cl) return [];
			return this._getSubclassesRaw(cl).filter(sc => this._isAllowedByFilters(sc))
				.map(sc => ({ _kind: "subclass", name: sc.name, source: sc.source, _ent: sc }));
		}

		if (tab === "background") {
			return this._data.backgrounds.filter(b => this._isAllowedByFilters(b))
				.map(b => ({ _kind: "background", name: b.name, source: b.source, _ent: b }));
		}

		if (tab === "feats") {
			return this._data.feats.filter(f => this._isAllowedByFilters(f))
				.map(f => ({ _kind: "feat", name: f.name, source: f.source, _ent: f }));
		}

		return [];
	}

	_renderList () {
		const items = this._getFilteredListForActiveTab();
		this._els.list.innerHTML = "";

		if (!items.length) {
			const empty = document.createElement("div");
			empty.className = "cb__row";
			empty.textContent = "Nada encontrado.";
			this._els.list.appendChild(empty);
			this._listVm = [];
			return;
		}

		const tab = this._getTabKey();
		items.forEach((it, ix) => {
			const row = document.createElement("div");
			row.className = "cb__row";
			row.dataset.cbIx = String(ix);
			row.classList.toggle("cb__row--active", this._isRowActive(tab, it));

			row.innerHTML = `
				<div class="cb__row-top">
					<div class="cb__row-name">${this._escape(it.namePt || it.name)}</div>
					<div class="cb__row-meta">${this._escape(it.source || "")}</div>
				</div>
			`;
			this._els.list.appendChild(row);
		});

		this._listVm = items;
	}

	_isRowActive (tab, it) {
		const ch = this._state.choice;
		if (tab === "species") return ch.species && ch.species.name === it.name && ch.species.source === it.source;
		if (tab === "subrace") return ch.subrace && ch.subrace.name === it.name && ch.subrace.source === it.source;
		if (tab === "class") return ch.cls && ch.cls.name === it.name && ch.cls.source === it.source;
		if (tab === "subclass") return ch.subclass && ch.subclass.name === it.name && ch.subclass.source === it.source;
		if (tab === "background") return ch.background && ch.background.name === it.name && ch.background.source === it.source;
		if (tab === "feats") return ch.feats.some(f => f.name === it.name && f.source === it.source);
		return false;
	}

	_onClickListItem (ix) {
		const it = this._listVm?.[ix];
		if (!it) return;

		const tab = this._getTabKey();
		const ch = this._state.choice;

		const clearPreview = () => this._renderPreviewDefault();

		const toggleSingle = (field) => {
			const cur = ch[field];
			const isSame = cur && cur.name === it.name && cur.source === it.source;
			if (isSame) ch[field] = null;
			else ch[field] = {name: it.name, source: it.source};
			saveState(this._state);
			this._renderAll();
			return isSame ? clearPreview() : this._renderPreviewEntity(it._ent, `${it.name} (${it.source})`);
		};

		if (tab === "species") {
			const isSame = ch.species && ch.species.name === it.name && ch.species.source === it.source;
			if (isSame) {
				ch.species = null;
				ch.subrace = null;
				saveState(this._state);
				this._syncTabDisables();
				this._renderAll();
				return clearPreview();
			}
			ch.species = {name: it.name, source: it.source};
			ch.subrace = null;
			saveState(this._state);
			this._syncTabDisables();
			this._renderAll();
			return this._renderPreviewEntity(it._ent, `${it.name} (${it.source})`);
		}

		if (tab === "subrace") return toggleSingle("subrace");

		if (tab === "class") {
			const isSame = ch.cls && ch.cls.name === it.name && ch.cls.source === it.source;
			if (isSame) {
				ch.cls = null;
				ch.subclass = null;
				saveState(this._state);
				this._syncTabDisables();
				this._renderAll();
				return clearPreview();
			}
			ch.cls = {name: it.name, source: it.source};
			ch.subclass = null;
			saveState(this._state);
			this._syncTabDisables();
			this._renderAll();
			return this._renderPreviewClass(it._ent);
		}

		if (tab === "subclass") {
			const cur = ch.subclass;
			const isSame = cur && cur.name === it.name && cur.source === it.source;
			if (isSame) {
				ch.subclass = null;
				saveState(this._state);
				this._renderAll();
				return clearPreview();
			}
			ch.subclass = {name: it.name, source: it.source};
			saveState(this._state);
			this._renderAll();
			return this._renderPreviewSubclass(it._ent);
		}

		if (tab === "background") return toggleSingle("background");

		if (tab === "feats") {
			const feats = ch.feats;
			const iExisting = feats.findIndex(f => f.name === it.name && f.source === it.source);
			if (~iExisting) feats.splice(iExisting, 1);
			else feats.push({name: it.name, source: it.source});
			saveState(this._state);
			this._renderAll();
			return this._renderPreviewFeats();
		}
	}

	_renderChips () {
		const ch = this._state.choice;
		const chips = [];
		const pushChip = (label, value) => value ? chips.push(`<span class="cb__chip"><b>${this._escape(label)}:</b> ${this._escape(value)}</span>`) : null;

		if (this._state.meta.name) pushChip("Nome", this._state.meta.name);
		if (this._state.meta.editId) pushChip("Editando", this._state.meta.editId);
		if (ch.species) pushChip("Espécie", `${ch.species.name} (${ch.species.source})${ch.subrace ? ` — ${ch.subrace.name} (${ch.subrace.source})` : ""}`);
		if (ch.cls) pushChip("Classe", `${ch.cls.name} (${ch.cls.source})${ch.subclass ? ` — ${ch.subclass.name} (${ch.subclass.source})` : ""}`);
		if (ch.background) pushChip("Antecedente", `${ch.background.name} (${ch.background.source})`);
		if (ch.feats?.length) pushChip("Talentos", String(ch.feats.length));

		this._els.chips.innerHTML = chips.join("");
	}

	_renderPreviewDefault (msg = "Selecione algo na lista para ver detalhes aqui.") {
		this._els.previewTbl.innerHTML = `<tr><td class="initial-message initial-message--med">${this._escape(msg)}</td></tr>`;
	}

	_getClassEntDereferenced (clsEnt) {
		const cpy = MiscUtil.copyFast(clsEnt);
		cpy.__prop = "class";

		const mapAny = (x) => {
			if (x == null) return x;
			if (typeof x === "string") {
				const key = x.trim();
				const found = this._classFeatureByUid.get(key);
				return found ? MiscUtil.copyFast(found) : {type: "entries", name: this._uidToPrettyName(key), entries: ["(Feature não carregada.)"]};
			}
			if (Array.isArray(x)) return x.map(mapAny);
			return x;
		};

		if (cpy.classFeatures) cpy.classFeatures = mapAny(cpy.classFeatures);
		return cpy;
	}

	_renderPreviewClass (clsEnt) {
		try {
			const deref = this._getClassEntDereferenced(clsEnt);
			this._els.previewTbl.innerHTML = Renderer.class.getCompactRenderedString(deref);
		} catch (e) {
			console.error(e);
			this._renderPreviewDefault("Falha ao renderizar a classe (veja Console).");
		}
	}

	_getSubclassEntDereferenced (scEnt) {
		const cpy = MiscUtil.copyFast(scEnt);
		cpy.__prop = "subclass";

		if (cpy.subclassFeatures && Array.isArray(cpy.subclassFeatures)) {
			cpy.subclassFeatures = cpy.subclassFeatures.map(lvl => {
				const arr = Array.isArray(lvl) ? lvl : [lvl];
				return arr.map(it => {
					if (it == null) return null;
					if (typeof it !== "string") return it;

					const uid = it.trim();
					const found = this._subclassFeatureByUid.get(uid);
					if (found) return MiscUtil.copyFast(found);

					return {type: "entries", name: this._uidToPrettyName(uid), entries: ["(Feature não carregada.)"]};
				}).filter(Boolean);
			});
		}

		return cpy;
	}

	_renderPreviewSubclass (scEnt) {
		try {
			const deref = this._getSubclassEntDereferenced(scEnt);
			this._els.previewTbl.innerHTML = Renderer.subclass.getCompactRenderedString(deref);
		} catch (e) {
			console.error(e);
			this._renderPreviewDefault("Falha ao renderizar a subclass (veja Console).");
		}
	}

	_renderPreviewEntity (ent, title) {
		try {
			const renderer = Renderer.get();
			const body = ent?.entries
				? renderer.render({type: "entries", entries: ent.entries})
				: `<div class="initial-message initial-message--med">Sem “entries” para renderizar.</div>`;

			this._els.previewTbl.innerHTML = `
				<tr><td><div class="ve-h3 ve-mt-0 ve-mb-2">${this._escape(title || ent?.name || "Details")}</div></td></tr>
				<tr><td>${body}</td></tr>
			`;
		} catch (e) {
			console.error(e);
			this._renderPreviewDefault("Falha ao renderizar (veja Console).");
		}
	}

	_renderPreviewFeats () {
		const picks = this._state.choice.feats || [];
		if (!picks.length) return this._renderPreviewDefault();

		const renderer = Renderer.get();
		const ents = picks
			.map(p => this._data.feats.find(f => f.name === p.name && f.source === p.source))
			.filter(Boolean);

		const html = ents.map((f) => {
			const title = `<div class="cb__feat-title">${this._escape(f.name)} <span class="ve-muted">(${this._escape(f.source)})</span></div>`;
			const body = f.entries ? renderer.render({type: "entries", entries: f.entries}) : "";
			return `${title}${body}`;
		}).join("");

		this._els.previewTbl.innerHTML = `
			<tr><td><div class="ve-h3 ve-mt-0 ve-mb-2">Selected Feats</div></td></tr>
			<tr><td>${html}</td></tr>
		`;
	}

	_escape (str) {
		return String(str ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&lt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	// =========================
	// SAVE/UPDATE
	// =========================
	async _pSaveAsNew () {
		const name = (this._state.meta.name || "").trim();
		if (!name) return toast("Dê um nome ao personagem antes de salvar.", "warning");

		const id = getUid();
		const now = Date.now();

		// “vira” o record atual
		this._state.meta.editId = id;
		saveState(this._state);
		this._updateSaveButtons();
		this._renderChips();

		const record = {
			id,
			name,
			createdAt: now,
			updatedAt: now,
			state: this._cloneState(),
		};

		await this._db.setItem(id, record);
		toast(`Salvo como novo: "${name}"`, "success");
	}

	async _pUpdateExisting () {
		const name = (this._state.meta.name || "").trim();
		if (!name) return toast("Dê um nome ao personagem antes de salvar.", "warning");

		const id = this._state.meta.editId;
		if (!id) return toast("Nenhum personagem carregado para atualizar. Use \"Salvar como novo\".", "warning");
		const now = Date.now();
		const existing = await this._db.getItem(id);

		const createdAt = existing?.createdAt || now;

		const record = {
			id,
			name,
			createdAt,
			updatedAt: now,
			state: this._cloneState(),
		};

		await this._db.setItem(id, record);
		toast(`Atualizado: "${name}"`, "success");
	}

	_cloneState () {
		// evita referenciar objetos “vivos” do app
		try { return MiscUtil.copyFast(this._state); }
		catch { return JSON.parse(JSON.stringify(this._state)); }
	}
}

window.addEventListener("load", async () => {
	const app = new CharacterBuilderApp();
	await app.pInit();
	window.dbg_cb = app;
});
