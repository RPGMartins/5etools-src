/* global Renderer, localforage, VetoolsConfig, Parser, MiscUtil, DataUtil */
"use strict";

const CB_STORAGE_KEY = "rpgmartins_cb_active_v5";
const CB_DB_NAME = "rpgmartins_5etools";
const CB_DB_STORE = "characters_v1";

const isSrdish = (ent) => !!(ent?.srd || ent?.basicRules || ent?.srd52 || ent?.basicRules2024);
const normArr = (it) => it == null ? [] : (Array.isArray(it) ? it : [it]);

const saveState = (st) => { try { localStorage.setItem(CB_STORAGE_KEY, JSON.stringify(st)); } catch (e) {} };
const loadState = () => { try { const raw = localStorage.getItem(CB_STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };

const getUid = () => { try { return crypto.randomUUID(); } catch { return `cb_${Date.now()}_${Math.random().toString(16).slice(2)}`; } };

const toast = (msg, type = "info") => {
	if (window.JqueryUtil?.doToast) return JqueryUtil.doToast({content: msg, type});
	alert(msg);
};

class CharacterBuilderApp {
	constructor () {
		this._state = loadState() || {
			meta: { name: "", level: 1, isSrdOnly: true, activeTab: "species" },
			choice: {
				species: null,      // {name, source}
				subrace: null,      // {name, source, isLineage?, versionName?}
				cls: null,          // {name, source}
				subclass: null,     // {name, source}
				background: null,   // {name, source}
				feats: [],          // [{name, source}] ordem importa
			},
		};

		this._data = {
			races: null,
			classes: null,
			subclasses: null,
			classFeatures: null,
			subclassFeatures: null,
			backgrounds: null,
			feats: null,
		};

		this._raceGroups = new Map(); // key => {name, source, baseEnt, subEnts[]}
		this._speciesVm = [];

		this._subclassFeatureByUid = new Map(); // uid -> subclassFeature object

		this._els = {};
		this._listVm = [];

		this._db = localforage.createInstance({ name: CB_DB_NAME, storeName: CB_DB_STORE });
	}

	async pInit () {
		this._cacheElements();
		this._bindEvents();
		this._syncControlsFromState();

		this._renderPreviewDefault("Carregando dados...");
		await this._pLoadAllData();

		this._syncTabDisables();
		this._renderAll();
		this._renderPreviewDefault();
	}

	_cacheElements () {
		this._els.tabs = document.getElementById("cb__tabs");
		this._els.toggleSrd = document.getElementById("cb__toggle_srd");
		this._els.list = document.getElementById("cb__list");

		this._els.name = document.getElementById("cb__name");
		this._els.level = document.getElementById("cb__level");
		this._els.chips = document.getElementById("cb__chips");

		this._els.previewTbl = document.getElementById("cb__preview_tbl");

		this._els.btnCreate = document.getElementById("cb__btn_create");
		this._els.btnReset = document.getElementById("cb__btn_reset");

		this._els.noticeSrd = document.getElementById("cb__notice_srd");
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

		this._els.level.addEventListener("input", () => {
			const lvl = Number(this._els.level.value || 1);
			this._state.meta.level = Math.max(1, Math.min(20, isNaN(lvl) ? 1 : lvl));
			saveState(this._state);
			this._renderChips();
		});

		this._els.btnReset.addEventListener("click", () => {
			localStorage.removeItem(CB_STORAGE_KEY);
			location.reload();
		});

		this._els.btnCreate.addEventListener("click", async () => {
			const name = (this._state.meta.name || "").trim();
			if (!name) return toast("Dê um nome ao personagem antes de salvar.", "warning");

			const id = getUid();
			const now = Date.now();
			const record = { id, name, createdAt: now, updatedAt: now, state: this._state };

			await this._db.setItem(id, record);
			toast(`Character "${name}" salvo no browser!`, "success");
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

	_syncControlsFromState () {
		this._els.name.value = this._state.meta.name || "";
		this._els.level.value = String(this._state.meta.level || 1);
		this._els.toggleSrd.checked = !!this._state.meta.isSrdOnly;
		this._syncTabs();
		this._updateSrdNotice();
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

	_raceKey (name, source) { return `${name}||${source}`; }

	async _pLoadAllData () {
		// ---------------- races (base + subraces 2014)
		const racesJson = await fetch("data/races.json").then(r => r.json());
		this._data.races = normArr(racesJson.race);

		for (const r of this._data.races) {
			// Subrace 2014: {raceName, raceSource}
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
			.map(grp => ({ _kind: "species", name: grp.name, source: grp.source, _grpKey: this._raceKey(grp.name, grp.source), _ent: grp.baseEnt }));

		// ---------------- backgrounds
		const bgsJson = await fetch("data/backgrounds.json").then(r => r.json());
		this._data.backgrounds = normArr(bgsJson.background);

		// ---------------- feats
		const featsJson = await fetch("data/feats.json").then(r => r.json());
		this._data.feats = normArr(featsJson.feat);

		// ---------------- classes (+ subclasses + features)
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

		// lookup de subclassFeature por UID (pra trocar UIDs por objetos antes de renderizar)
		this._subclassFeatureByUid = new Map();
		for (const f of subclassFeatures) {
			try {
				const uid = DataUtil.class.packUidSubclassFeature(f);
				this._subclassFeatureByUid.set(uid, f);
			} catch (e) {}
		}
	}

	_renderAll () {
		this._renderList();
		this._renderChips();
		this._updateSrdNotice();
	}

	_getTabKey () { return this._state.meta.activeTab; }

	// ---------- XPHB “lineages” (subrace-like)
	_getLineagesFromXphb (baseEnt) {
		if (!baseEnt || baseEnt.source !== "XPHB") return [];
		const vers = normArr(baseEnt._versions);
		if (!vers.length) return [];

		const prefix = `${baseEnt.name};`;
		return vers
			.filter(v => (v.source || baseEnt.source) === baseEnt.source && (v.name || "").startsWith(prefix))
			.map(v => {
				let nm = v.name.slice(prefix.length).trim();         // "Drow Lineage"
				nm = nm.replace(/\bLineage\b/i, "").trim();          // "Drow"
				nm = nm.replace(/^\s*;\s*/g, "").trim();
				return {
					__isLineage: true,
					name: nm || v.name,
					source: baseEnt.source,
					_versionName: v.name,
				};
			});
	}

	_applyXphbVersionToBase (baseEnt, versionName, displayName) {
		const ver = normArr(baseEnt._versions).find(v => v.name === versionName);
		if (!ver) return baseEnt;

		const cpy = MiscUtil.copyFast(baseEnt);
		cpy._displayName = displayName ? `${baseEnt.name} (${displayName})` : baseEnt.name;

		// aplica replaceArr em entries (suficiente p/ preview)
		const mods = ver?._mod?.entries;
		const arrMods = mods == null ? [] : (Array.isArray(mods) ? mods : [mods]);

		for (const m of arrMods) {
			if (m?.mode !== "replaceArr") continue;
			const toReplace = m.replace;
			const items = m.items;
			if (!toReplace || !items || !Array.isArray(cpy.entries)) continue;

			const ix = cpy.entries.findIndex(it => it?.name === toReplace);
			if (~ix) cpy.entries.splice(ix, 1, items);
		}

		// sobrescreve alguns campos úteis, se existirem
		["darkvision", "additionalSpells", "resist", "speed", "skillProficiencies"].forEach(k => {
			if (ver[k] != null) cpy[k] = MiscUtil.copyFast(ver[k]);
		});

		return cpy;
	}

	_getSubracesFor (species) {
		const grp = this._raceGroups.get(this._raceKey(species.name, species.source));
		if (!grp) return [];

		if (grp.subEnts?.length) return grp.subEnts.sort((a, b) => a.name.localeCompare(b.name));

		// XPHB: não tem subrace separada → usa “lineages”
		return this._getLineagesFromXphb(grp.baseEnt);
	}

	_getSubclassesFor (cls) {
		let out = this._data.subclasses
			.filter(sc => sc.className === cls.name && sc.classSource === cls.source);

		// fallback: XPHB class tentando casar com PHB subclasses
		if (!out.length && cls.source === "XPHB") {
			out = this._data.subclasses.filter(sc => sc.className === cls.name && sc.classSource === "PHB");
		}

		return out.sort((a, b) => a.name.localeCompare(b.name));
	}

	_syncTabDisables () {
		const sp = this._state.choice.species;
		const subraces = sp ? this._getSubracesFor(sp) : [];
		this._setTabDisabled("subrace", !subraces.length);

		const cl = this._state.choice.cls;
		const subclasses = cl ? this._getSubclassesFor(cl) : [];
		this._setTabDisabled("subclass", !subclasses.length);

		if (this._state.meta.activeTab === "subrace" && !subraces.length) this._goTab("species");
		if (this._state.meta.activeTab === "subclass" && !subclasses.length) this._goTab("class");
	}

	_goTab (tabKey) {
		this._state.meta.activeTab = tabKey;
		saveState(this._state);
		this._syncTabs();
		this._renderList();
		this._renderPreviewDefault();
	}

	_getFilteredListForActiveTab () {
		const tab = this._getTabKey();
		const isSrdOnly = !!this._state.meta.isSrdOnly;

		if (tab === "species") {
			if (!isSrdOnly) return this._speciesVm;
			return this._speciesVm.filter(it => isSrdish(it._ent));
		}

		if (tab === "subrace") {
			const sp = this._state.choice.species;
			const subs = sp ? this._getSubracesFor(sp) : [];
			const list = subs.map(r => ({ _kind: "subrace", name: r.name, source: r.source, _ent: r }));
			return isSrdOnly
				? list.filter(it => it._ent.__isLineage ? true : isSrdish(it._ent))
				: list;
		}

		if (tab === "class") {
			const list = (isSrdOnly ? this._data.classes.filter(isSrdish) : this._data.classes)
				.map(c => ({ _kind: "class", name: c.name, source: c.source, _ent: c }));
			return list;
		}

		if (tab === "subclass") {
			const cl = this._state.choice.cls;
			const subs = cl ? this._getSubclassesFor(cl) : [];
			const list = subs.map(sc => ({ _kind: "subclass", name: sc.name, source: sc.source, _ent: sc }));
			return isSrdOnly ? list.filter(it => isSrdish(it._ent)) : list;
		}

		if (tab === "background") {
			const list = (isSrdOnly ? this._data.backgrounds.filter(isSrdish) : this._data.backgrounds)
				.map(b => ({ _kind: "background", name: b.name, source: b.source, _ent: b }));
			return list;
		}

		if (tab === "feats") {
			const list = (isSrdOnly ? this._data.feats.filter(isSrdish) : this._data.feats)
				.map(f => ({ _kind: "feat", name: f.name, source: f.source, _ent: f }));
			return list;
		}

		return [];
	}

	_renderList () {
		const items = this._getFilteredListForActiveTab();
		this._els.list.innerHTML = "";

		if (!items.length) {
			const empty = document.createElement("div");
			empty.className = "cb__row";
			empty.textContent = this._getEmptyMessage();
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
					<div class="cb__row-name">${this._escape(it.name)}</div>
					<div class="cb__row-meta">${this._escape(it.source || "")}</div>
				</div>
			`;

			this._els.list.appendChild(row);
		});

		this._listVm = items;
	}

	_getEmptyMessage () {
		const tab = this._getTabKey();
		if (tab === "subrace") return "Selecione uma Species primeiro (ou ela não tem subrace/lineage).";
		if (tab === "subclass") return "Selecione uma Class primeiro.";
		return "Nada encontrado.";
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
			return this._renderPreviewSpecies();
		}

		if (tab === "subrace") {
			const isSame = ch.subrace && ch.subrace.name === it.name && ch.subrace.source === it.source;
			if (isSame) {
				ch.subrace = null;
				saveState(this._state);
				this._renderAll();
				return clearPreview();
			}

			ch.subrace = {
				name: it.name,
				source: it.source,
				isLineage: !!it._ent.__isLineage,
				versionName: it._ent.__isLineage ? it._ent._versionName : null,
			};

			saveState(this._state);
			this._renderAll();
			return this._renderPreviewSpecies();
		}

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
			const isSame = ch.subclass && ch.subclass.name === it.name && ch.subclass.source === it.source;
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

		if (tab === "background") {
			const isSame = ch.background && ch.background.name === it.name && ch.background.source === it.source;
			if (isSame) {
				ch.background = null;
				saveState(this._state);
				this._renderAll();
				return clearPreview();
			}

			ch.background = {name: it.name, source: it.source};
			saveState(this._state);
			this._renderAll();
			return this._renderPreviewEntity(it._ent, `${it.name} (${it.source})`);
		}

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

		if (this._state.meta.name) pushChip("Name", this._state.meta.name);
		pushChip("Level", String(this._state.meta.level || 1));

		if (ch.species) {
			let sp = `${ch.species.name} (${ch.species.source})`;
			if (ch.subrace) sp += ` — ${ch.subrace.name} (${ch.subrace.source})`;
			pushChip("Species", sp);
		}
		if (ch.cls) {
			let cl = `${ch.cls.name} (${ch.cls.source})`;
			if (ch.subclass) cl += ` — ${ch.subclass.name} (${ch.subclass.source})`;
			pushChip("Class", cl);
		}
		if (ch.background) pushChip("Background", `${ch.background.name} (${ch.background.source})`);
		if (ch.feats?.length) pushChip("Feats", String(ch.feats.length));

		this._els.chips.innerHTML = chips.join("");
	}

	_renderPreviewDefault (msg = "Selecione algo na lista para ver detalhes aqui.") {
		this._els.previewTbl.innerHTML = `<tr><td class="initial-message initial-message--med">${this._escape(msg)}</td></tr>`;
	}

	_getSelectedSpeciesBaseEnt () {
		const sp = this._state.choice.species;
		if (!sp) return null;
		const grp = this._raceGroups.get(this._raceKey(sp.name, sp.source));
		return grp?.baseEnt || null;
	}

	_getSelectedSubraceEnt (baseEnt) {
		const sr = this._state.choice.subrace;
		if (!sr || !baseEnt) return null;

		if (sr.isLineage && sr.versionName) {
			return this._applyXphbVersionToBase(baseEnt, sr.versionName, sr.name);
		}

		const grp = this._raceGroups.get(this._raceKey(baseEnt.name, baseEnt.source));
		return grp?.subEnts?.find(it => it.name === sr.name && it.source === sr.source) || null;
	}

	_renderPreviewSpecies () {
		const baseEnt = this._getSelectedSpeciesBaseEnt();
		if (!baseEnt) return this._renderPreviewDefault();

		const subEnt = this._getSelectedSubraceEnt(baseEnt);

		// lineage XPHB (já aplicado)
		if (subEnt && this._state.choice.subrace?.isLineage) {
			return this._renderPreviewEntity(subEnt, subEnt._displayName || `${subEnt.name} (${subEnt.source})`);
		}

		// subrace 2014: concatena base + sub
		if (subEnt) {
			const renderer = Renderer.get();
			const title = `${baseEnt.name} (${baseEnt.source}) — ${subEnt.name} (${subEnt.source})`;
			const entries = [
				...(baseEnt.entries || []),
				{type: "hr"},
				...(subEnt.entries || []),
			].filter(Boolean);

			const body = renderer.render({type: "entries", entries});
			this._els.previewTbl.innerHTML = `
				<tr><td><div class="ve-h3 ve-mt-0 ve-mb-2">${this._escape(title)}</div></td></tr>
				<tr><td>${body}</td></tr>
			`;
			return;
		}

		return this._renderPreviewEntity(baseEnt, `${baseEnt.name} (${baseEnt.source})`);
	}

	_renderPreviewClass (clsEnt) {
		try {
			const cpy = MiscUtil.copyFast(clsEnt);
			cpy.__prop = "class";
			this._els.previewTbl.innerHTML = Renderer.class.getCompactRenderedString(cpy);
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

					try {
						const u = DataUtil.class.unpackUidSubclassFeature(uid);
						return {type: "entries", name: u.name, source: u.source, level: u.level, entries: ["(Feature não carregada.)"]};
					} catch {
						return {type: "entries", name: uid, entries: ["(Feature não carregada.)"]};
					}
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
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
}

window.addEventListener("load", async () => {
	const app = new CharacterBuilderApp();
	await app.pInit();
	window.dbg_cb = app;
});
