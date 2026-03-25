/* global localforage, Parser, Renderer, BrewUtil2, PrereleaseUtil */
import { I18n } from "./i18n.js";

"use strict";

const DB_NAME = "rpgmartins_5etools";
const DB_STORE = "characters_v1";
const LS_LAST_CHAR = "rpgmartins_cs_lastCharId";

const ABILS = ["str", "dex", "con", "int", "wis", "cha"];
// PT-BR
const ABIL_LABEL = {str: "FOR", dex: "DES", con: "CON", int: "INT", wis: "SAB", cha: "CAR"};

// Os nomes em inglês ainda são importantes para mapear "skills" que vêm dos JSONs
const SKILLS = [
	{key: "acrobatics", name: "Acrobatics", abil: "dex"},
	{key: "animalHandling", name: "Animal Handling", abil: "wis"},
	{key: "arcana", name: "Arcana", abil: "int"},
	{key: "athletics", name: "Athletics", abil: "str"},
	{key: "deception", name: "Deception", abil: "cha"},
	{key: "history", name: "History", abil: "int"},
	{key: "insight", name: "Insight", abil: "wis"},
	{key: "intimidation", name: "Intimidation", abil: "cha"},
	{key: "investigation", name: "Investigation", abil: "int"},
	{key: "medicine", name: "Medicine", abil: "wis"},
	{key: "nature", name: "Nature", abil: "int"},
	{key: "perception", name: "Perception", abil: "wis"},
	{key: "performance", name: "Performance", abil: "cha"},
	{key: "persuasion", name: "Persuasion", abil: "cha"},
	{key: "religion", name: "Religion", abil: "int"},
	{key: "sleightOfHand", name: "Sleight of Hand", abil: "dex"},
	{key: "stealth", name: "Stealth", abil: "dex"},
	{key: "survival", name: "Survival", abil: "wis"},
];

const SKILL_KEY_TO_NAME = new Map(SKILLS.map(s => [s.key, s.name]));
const SKILL_NAME_TO_KEY = new Map(SKILLS.map(s => [s.name.toLowerCase(), s.key]));

// PT-BR (somente display)
const SKILL_KEY_TO_NAME_PT = new Map([
	["acrobatics", "Acrobacias"],
	["animalHandling", "Adestramento"],
	["arcana", "Arcanismo"],
	["athletics", "Atletismo"],
	["deception", "Enganação"],
	["history", "História"],
	["insight", "Intuição"],
	["intimidation", "Intimidação"],
	["investigation", "Investigação"],
	["medicine", "Medicina"],
	["nature", "Natureza"],
	["perception", "Percepção"],
	["performance", "Atuação"],
	["persuasion", "Persuasão"],
	["religion", "Religião"],
	["sleightOfHand", "Prestidigitação"],
	["stealth", "Furtividade"],
	["survival", "Sobrevivência"],
]);

const getSkillDisplayName = (key) => SKILL_KEY_TO_NAME_PT.get(key) || SKILL_KEY_TO_NAME.get(key) || key;

const esc = (s) => String(s ?? "")
	.replace(/&/g, "&amp;")
	.replace(/</g, "&lt;")
	.replace(/>/g, "&gt;")
	.replace(/"/g, "&quot;")
	.replace(/'/g, "&#039;");

const getParam = (k) => {
	const u = new URL(location.href);
	return u.searchParams.get(k);
};

const profBonusFromLevel = (lvl) => 2 + Math.floor((Math.max(1, lvl) - 1) / 4);

const modFromScore = (score) => {
	const n = Number(score);
	if (!Number.isFinite(n)) return 0;
	return Math.floor((n - 10) / 2);
};

const fmtMod = (n) => (n >= 0 ? `+${n}` : `${n}`);

function debounce (fn, ms = 250) {
	let t = null;
	return (...args) => {
		if (t) clearTimeout(t);
		t = setTimeout(() => fn(...args), ms);
	};
}

function normArr (x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

function anyTrue (obj) {
	if (!obj) return false;
	return Object.values(obj).some(Boolean);
}

function uniqLines (arr) {
	const set = new Set();
	for (const s of arr) {
		const t = String(s || "").trim();
		if (t) set.add(t);
	}
	return [...set];
}

function parseLangProf (lp) {
	const fixed = [];
	const choose = [];

	for (const it of normArr(lp)) {
		if (!it || typeof it !== "object") continue;
		for (const [k, v] of Object.entries(it)) {
			if (v === true) fixed.push(k);
			else if (typeof v === "number" && v > 0) choose.push(`Escolha ${v} (${k})`);
		}
	}
	return { fixed, choose };
}

function parseSkillProf (sp) {
	const fixed = [];
	let choose = null;

	for (const it of normArr(sp)) {
		if (!it || typeof it !== "object") continue;

		if (it.choose?.from && it.choose?.count != null) {
			const from = it.choose.from.map(s => String(s));
			const count = Number(it.choose.count);
			if (Number.isFinite(count)) choose = { count, from };
			continue;
		}

		for (const [k, v] of Object.entries(it)) {
			if (v === true) fixed.push(k);
		}
	}

	return { fixed, choose };
}

function parseStartingProfs (obj) {
	const out = { armor: [], weapons: [], tools: [] };
	if (!obj) return out;

	const sp = obj.startingProficiencies || obj;

	const addArr = (dst, x) => normArr(x).forEach(v => { if (v) dst.push(String(v)); });

	addArr(out.armor, sp.armor);
	addArr(out.weapons, sp.weapons);
	addArr(out.tools, sp.tools);

	if (obj.armorProficiencies) addArr(out.armor, Object.keys(obj.armorProficiencies).filter(k => obj.armorProficiencies[k] === true));
	if (obj.weaponProficiencies) addArr(out.weapons, Object.keys(obj.weaponProficiencies).filter(k => obj.weaponProficiencies[k] === true));
	if (obj.toolProficiencies) addArr(out.tools, Object.keys(obj.toolProficiencies).filter(k => obj.toolProficiencies[k] === true));

	return out;
}

class SheetApp {
	constructor () {
		this._db = localforage.createInstance({ name: DB_NAME, storeName: DB_STORE });

		this._els = {
			selChar: document.getElementById("cs__sel_char"),
			selLevel: document.getElementById("cs__sel_level"),
			btnManager: document.getElementById("cs__btn_manager"),
			btnPrint: document.getElementById("cs__btn_print"),
			btnPrintFull: document.getElementById("cs__btn_print_full"),

			meta: document.getElementById("cs__meta"),
			metaRhs: document.getElementById("cs__meta_rhs"),

			name: document.getElementById("cs__name"),
			sub: document.getElementById("cs__sub"),
			prof: document.getElementById("cs__prof"),
			pp: document.getElementById("cs__pp"),

			abilities: document.getElementById("cs__abilities"),
			saves: document.getElementById("cs__saves"),
			skills: document.getElementById("cs__skills"),
			skillsHint: document.getElementById("cs__skills_hint"),

			taProfs: document.getElementById("cs__ta_profs"),
			taLang: document.getElementById("cs__ta_lang"),
			taNotes: document.getElementById("cs__ta_notes"),

			features: document.getElementById("cs__features"),
		};

		this._chars = [];
		this._rec = null;

		this._data = { races: [], backgrounds: [], feats: [] };
		this._rules = null;

		this._pSaveDebounced = debounce(() => this._pSaveRec(), 300);

		this._pickableSkills = new Set();
		this._chooseSkillInfo = null;

		this._brewClassCache = null; // cache de class/subclass/features (brew+prerelease)
	}

	async pInit () {
		await Promise.allSettled([
			PrereleaseUtil?.pInit?.(),
			BrewUtil2?.pInit?.(),
		]);

		// i18n overlay (PT-BR)
		await I18n.pInit({ lang: "ptbr" });

		await this._pLoadCommonData();
		await this._pLoadCharList();
		this._bind();

		const idFromUrl = getParam("id");
		const idLast = localStorage.getItem(LS_LAST_CHAR);
		const pick = idFromUrl || idLast || (this._chars[0]?.id ?? null);

		if (pick) {
			this._els.selChar.value = pick;
			await this._pLoadCharacter(pick);
		} else {
			this._renderEmpty();
		}
	}

	_bind () {
		this._els.selChar.addEventListener("change", async () => {
			const id = this._els.selChar.value;
			if (!id) return;
			await this._pLoadCharacter(id);
		});

		this._els.selLevel.addEventListener("change", () => {
			if (!this._rec) return;
			this._rec.sheet.level = Number(this._els.selLevel.value) || 1;
			this._pSaveDebounced();
			this._renderDerived();
			this._renderSaves();
			this._renderSkills();
			this._renderFeatures();
		});

		this._els.taProfs.addEventListener("input", () => {
			if (!this._rec) return;
			this._rec.sheet.profsText = this._els.taProfs.value || "";
			this._pSaveDebounced();
		});

		this._els.taLang.addEventListener("input", () => {
			if (!this._rec) return;
			this._rec.sheet.langText = this._els.taLang.value || "";
			this._pSaveDebounced();
		});

		this._els.taNotes.addEventListener("input", () => {
			if (!this._rec) return;
			this._rec.sheet.notes = this._els.taNotes.value || "";
			this._pSaveDebounced();
		});

		this._els.btnManager.addEventListener("click", () => location.href = "charmanage.html");

		this._els.btnPrint?.addEventListener("click", () => this._doOpenPrint({ isFull: false }));
		this._els.btnPrintFull?.addEventListener("click", () => this._doOpenPrint({ isFull: true }));
	}

	_doOpenPrint ({ isFull = false } = {}) {
		if (!this._rec?.id) return;

		const lvlCurrent = Number(this._els.selLevel?.value) || Number(this._rec?.sheet?.level) || 1;
		const lvl = isFull ? 20 : lvlCurrent;

		// Se o seu HTML tiver outro nome, ajuste aqui:
		const u = new URL("charsheet-print.html", window.location.href);
		u.searchParams.set("id", this._rec.id);
		u.searchParams.set("lvl", String(lvl));
		u.searchParams.set("lang", "ptbr");

		// Você pediu pra abrir já com as entries de features
		u.searchParams.set("features", "1");

		window.open(u.toString(), "_blank", "noopener");
	}

	async _pLoadCharList () {
		const out = [];
		await this._db.iterate((value, key) => {
			if (!value) return;
			out.push({
				id: value.id || key,
				name: value.name || value?.state?.meta?.name || "Sem nome",
				updatedAt: value.updatedAt || value.createdAt || 0,
			});
		});
		out.sort((a, b) => (b.updatedAt - a.updatedAt) || a.name.localeCompare(b.name));
		this._chars = out;

		this._els.selChar.innerHTML = out.length
			? out.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")
			: `<option value="">(nenhum personagem salvo)</option>`;
	}

	async _pLoadCommonData () {
		const racesJson = await fetch("data/races.json").then(r => r.json());
		const bgsJson = await fetch("data/backgrounds.json").then(r => r.json());
		const featsJson = await fetch("data/feats.json").then(r => r.json());

		this._data.races = normArr(racesJson.race);
		this._data.backgrounds = normArr(bgsJson.background);
		this._data.feats = normArr(featsJson.feat);

		const merge = (obj) => {
			if (!obj) return;
			this._data.races.push(...normArr(obj.race));
			this._data.backgrounds.push(...normArr(obj.background));
			this._data.feats.push(...normArr(obj.feat));
		};

		I18n.patchInPlaceEntities("race", this._data.races);
		I18n.patchInPlaceEntities("background", this._data.backgrounds);
		I18n.patchInPlaceEntities("feat", this._data.feats);

		try { if (PrereleaseUtil?.pGetBrewProcessed) merge(await PrereleaseUtil.pGetBrewProcessed()); } catch {}
		try { if (BrewUtil2?.pGetBrewProcessed) merge(await BrewUtil2.pGetBrewProcessed()); } catch {}
	}

	async _pLoadCharacter (id) {
		const rec = await this._db.getItem(id);
		if (!rec) return;

		localStorage.setItem(LS_LAST_CHAR, id);

		rec.sheet = rec.sheet || this._getDefaultSheet();
		rec.sheet.level = Number(rec.sheet.level) || 1;
		rec.sheet.abilities = rec.sheet.abilities || this._getDefaultSheet().abilities;
		rec.sheet.saveProfs = rec.sheet.saveProfs || {};
		rec.sheet.skillProfs = rec.sheet.skillProfs || {};
		rec.sheet.profsText = rec.sheet.profsText ?? "";
		rec.sheet.langText = rec.sheet.langText ?? "";
		rec.sheet.notes = rec.sheet.notes ?? "";
		rec.sheet.ui = rec.sheet.ui || {};
		rec.sheet.ui.featureOpen = rec.sheet.ui.featureOpen || {};

		this._rec = rec;

		this._rules = await this._pLoadRulesForRec(rec);

		this._maybeAutoFillSaveProfs();
		this._computeSkillChoiceInfo();
		this._autoPopulateTextAreasAndFixedSkills();

		this._els.selLevel.value = String(rec.sheet.level);
		this._els.taProfs.value = rec.sheet.profsText;
		this._els.taLang.value = rec.sheet.langText;
		this._els.taNotes.value = rec.sheet.notes;

		this._renderHeader();
		this._renderAbilities();
		this._renderDerived();
		this._renderSaves();
		this._renderSkills();
		this._renderFeatures();

		await this._pSaveRec();
	}

	_getDefaultSheet () {
		return {
			level: 1,
			abilities: {str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10},
			saveProfs: {},
			skillProfs: {},
			profsText: "",
			langText: "",
			notes: "",
		};
	}

	_renderEmpty () {
		this._els.name.textContent = "—";
		this._els.sub.textContent = "Nenhum personagem salvo ainda.";
		this._els.meta.textContent = "";
		this._els.metaRhs.textContent = "";
		this._els.abilities.innerHTML = "";
		this._els.saves.innerHTML = "";
		this._els.skills.innerHTML = "";
		this._els.features.innerHTML = `<div class="initial-message initial-message--med">Crie um personagem primeiro.</div>`;
	}

	_renderHeader () {
		const rec = this._rec;
		const ch = rec?.state?.choice || {};

		const sp = ch.species ? `${ch.species.name} (${ch.species.source})` : "—";
		const sr = ch.subrace ? ` — ${ch.subrace.name} (${ch.subrace.source})` : "";
		const cls = ch.cls ? `${ch.cls.name} (${ch.cls.source})` : "—";
		const sc = ch.subclass ? ` — ${ch.subclass.name} (${ch.subclass.source})` : "";
		const bg = ch.background ? `${ch.background.name} (${ch.background.source})` : "—";

		this._els.name.textContent = rec.name || rec?.state?.meta?.name || "Sem nome";
		this._els.sub.textContent = `${cls}${sc} • ${sp}${sr} • ${bg}`;

		this._els.meta.textContent = `ID: ${rec.id}`;
		this._els.metaRhs.textContent = `Salvo localmente • Atualizado: ${new Date(rec.updatedAt || rec.createdAt || Date.now()).toLocaleString()}`;
	}

	_renderAbilities () {
		const ab = this._rec.sheet.abilities;

		this._els.abilities.innerHTML = ABILS.map(k => {
			const score = Number(ab[k]) || 10;
			const mod = modFromScore(score);

			return `
				<div class="cs__ab" data-ab="${esc(k)}">
					<div class="cs__ab-top">
						<div class="cs__ab-name">${esc(ABIL_LABEL[k])}</div>
						<div class="cs__ab-mod" data-ab-mod="${esc(k)}">${esc(fmtMod(mod))}</div>
					</div>
					<div class="cs__ab-score">
						<input class="ve-form-control input-sm" type="number" min="1" max="30" value="${esc(score)}" data-ab-in="${esc(k)}">
						<span class="cs__row-meta">valor</span>
					</div>
				</div>
			`;
		}).join("");

		this._els.abilities.querySelectorAll("[data-ab-in]").forEach(inp => {
			inp.addEventListener("input", () => {
				const k = inp.dataset.abIn;
				const val = Number(inp.value);
				if (!Number.isFinite(val)) return;

				this._rec.sheet.abilities[k] = Math.max(1, Math.min(30, Math.floor(val)));
				this._pSaveDebounced();

				const modEl = this._els.abilities.querySelector(`[data-ab-mod="${CSS.escape(k)}"]`);
				if (modEl) modEl.textContent = fmtMod(modFromScore(this._rec.sheet.abilities[k]));
				this._renderDerived();
				this._renderSaves();
				this._renderSkills();
			});
		});
	}

	_renderDerived () {
		const lvl = this._rec.sheet.level || 1;
		const pb = profBonusFromLevel(lvl);

		this._els.prof.textContent = `+${pb}`;

		const wisMod = modFromScore(this._rec.sheet.abilities.wis);
		const percProf = !!this._rec.sheet.skillProfs.perception;
		const pp = 10 + wisMod + (percProf ? pb : 0);
		this._els.pp.textContent = String(pp);
	}

	_renderSaves () {
		const lvl = this._rec.sheet.level || 1;
		const pb = profBonusFromLevel(lvl);
		const ab = this._rec.sheet.abilities;
		const sp = this._rec.sheet.saveProfs || {};

		this._els.saves.innerHTML = ABILS.map(k => {
			const mod = modFromScore(ab[k]);
			const isProf = !!sp[k];
			const total = mod + (isProf ? pb : 0);

			return `
				<div class="cs__row">
					<label style="display:flex; align-items:center; gap:8px; margin:0;">
						<input type="checkbox" data-save="${esc(k)}" ${isProf ? "checked" : ""}>
						<span class="cs__row-name">${esc(ABIL_LABEL[k])}</span>
						<span class="cs__row-meta">(${esc(fmtMod(mod))})</span>
					</label>
					<div class="cs__row-val">${esc(fmtMod(total))}</div>
				</div>
			`;
		}).join("");

		this._els.saves.querySelectorAll("[data-save]").forEach(cb => {
			cb.addEventListener("change", () => {
				const k = cb.dataset.save;
				this._rec.sheet.saveProfs[k] = cb.checked;
				this._pSaveDebounced();
				this._renderDerived();
				this._renderSaves();
			});
		});
	}

	_renderSkills () {
		const lvl = this._rec.sheet.level || 1;
		const pb = profBonusFromLevel(lvl);
		const ab = this._rec.sheet.abilities;
		const sp = this._rec.sheet.skillProfs || {};

		// dica: skills escolhíveis da classe
		if (this._chooseSkillInfo) {
			const fromNames = this._chooseSkillInfo.from.map(k => getSkillDisplayName(k)).join(", ");
			if (this._els.skillsHint) this._els.skillsHint.textContent =
				`Opções de perícias da classe: escolha ${this._chooseSkillInfo.count} entre: ${fromNames}`;
		} else if (this._pickableSkills.size) {
			const fromNames = [...this._pickableSkills].map(k => getSkillDisplayName(k)).join(", ");
			if (this._els.skillsHint) this._els.skillsHint.textContent =
				`Opções de perícias da classe: ${fromNames}`;
		} else {
			if (this._els.skillsHint) this._els.skillsHint.textContent = "";
		}

		// agrupa por atributo
		const groupsOrder = ["str", "dex", "con", "int", "wis", "cha"];
		const groups = new Map(groupsOrder.map(k => [k, []]));
		for (const sk of SKILLS) groups.get(sk.abil)?.push(sk);

		const renderRow = (sk) => {
			const mod = modFromScore(ab[sk.abil]);
			const isProf = !!sp[sk.key];
			const total = mod + (isProf ? pb : 0);
			const isPickable = this._pickableSkills.has(sk.key);

			return `
			<div class="cs__row ${isPickable ? "cs__row--pickable" : ""}">
				<label style="display:flex; align-items:center; gap:8px; margin:0;">
					<input type="checkbox" data-skill="${esc(sk.key)}" ${isProf ? "checked" : ""}>
					<span class="cs__row-name">${esc(getSkillDisplayName(sk.key))}</span>
					<span class="cs__row-meta">(${esc(ABIL_LABEL[sk.abil])} ${esc(fmtMod(mod))})${isPickable ? " • escolha" : ""}</span>
				</label>
				<div class="cs__row-val">${esc(fmtMod(total))}</div>
			</div>
		`;
		};

		const blocks = [];
		let alt = false;

		for (const abil of groupsOrder) {
			const arr = groups.get(abil) || [];
			if (!arr.length) continue;
			arr.sort((a, b) => getSkillDisplayName(a.key).localeCompare(getSkillDisplayName(b.key)));

			blocks.push(`
			<div class="cs__skills-group ${alt ? "cs__skills-group--alt" : ""}">
				<div class="cs__skills-group-hdr">
					${esc(ABIL_LABEL[abil])} <span>perícias</span>
				</div>
				${arr.map(renderRow).join("")}
			</div>
		`);

			alt = !alt;
		}

		this._els.skills.innerHTML = blocks.join("");

		this._els.skills.querySelectorAll("[data-skill]").forEach(cb => {
			cb.addEventListener("change", () => {
				const k = cb.dataset.skill;
				this._rec.sheet.skillProfs[k] = cb.checked;
				this._pSaveDebounced();
				this._renderDerived();
				this._renderSkills();
			});
		});
	}

	_findRaceBase (name, source) {
		return this._data.races.find(r => r.name === name && r.source === source && !r.raceName)
			|| this._data.races.find(r => r.name === name && r.source === source);
	}

	_findSubrace (raceName, raceSource, subName, subSource) {
		return this._data.races.find(r =>
			r.name === subName
			&& r.source === subSource
			&& (r.raceName === raceName)
			&& ((r.raceSource || r.source) === raceSource)
		);
	}

	_findBackground (name, source) {
		return this._data.backgrounds.find(b => b.name === name && b.source === source)
			|| this._data.backgrounds.find(b => b.name === name);
	}

	_findFeat (name, source) {
		return this._data.feats.find(f => f.name === name && f.source === source)
			|| this._data.feats.find(f => f.name === name);
	}

	_computeSkillChoiceInfo () {
		this._pickableSkills = new Set();
		this._chooseSkillInfo = null;

		const clsEnt = this._rules?.classEnt;
		if (!clsEnt) return;

		const sp = clsEnt.startingProficiencies?.skills || clsEnt.skillProficiencies || clsEnt.skills;
		const parsed = parseSkillProf(sp);

		// fixed vem em nomes (EN) -> key
		for (const nm of parsed.fixed) {
			const k = SKILL_NAME_TO_KEY.get(String(nm).toLowerCase());
			if (k) this._pickableSkills.add(k);
		}

		if (parsed.choose?.from?.length) {
			const fromKeys = parsed.choose.from
				.map(n => SKILL_NAME_TO_KEY.get(String(n).toLowerCase()))
				.filter(Boolean);
			fromKeys.forEach(k => this._pickableSkills.add(k));
			this._chooseSkillInfo = { count: parsed.choose.count, from: fromKeys };
		}
	}

	_autoPopulateTextAreasAndFixedSkills () {
		if (!this._rec) return;

		const choice = this._rec.state?.choice || {};
		const race = choice.species ? this._findRaceBase(choice.species.name, choice.species.source) : null;
		const subrace = (choice.species && choice.subrace)
			? this._findSubrace(choice.species.name, choice.species.source, choice.subrace.name, choice.subrace.source)
			: null;
		const bg = choice.background ? this._findBackground(choice.background.name, choice.background.source) : null;

		const profLines = [];
		const langLines = [];

		const pushProfs = (label, obj) => {
			const p = parseStartingProfs(obj);
			if (p.armor.length) profLines.push(`${label} — Armaduras: ${p.armor.join(", ")}`);
			if (p.weapons.length) profLines.push(`${label} — Armas: ${p.weapons.join(", ")}`);
			if (p.tools.length) profLines.push(`${label} — Ferramentas: ${p.tools.join(", ")}`);
		};

		if (race) pushProfs("Raça", race);
		if (subrace) pushProfs("Sub-raça", subrace);
		if (this._rules?.classEnt) pushProfs("Classe", this._rules.classEnt);
		if (bg) pushProfs("Antecedente", bg);

		const addLang = (label, lp) => {
			const { fixed, choose } = parseLangProf(lp);
			if (fixed.length) langLines.push(`${label}: ${fixed.join(", ")}`);
			choose.forEach(c => langLines.push(`${label}: ${c}`));
		};

		if (race?.languageProficiencies) addLang("Raça", race.languageProficiencies);
		if (subrace?.languageProficiencies) addLang("Sub-raça", subrace.languageProficiencies);
		if (bg?.languageProficiencies) addLang("Antecedente", bg.languageProficiencies);

		if (!String(this._rec.sheet.profsText || "").trim() && profLines.length) {
			this._rec.sheet.profsText = uniqLines(profLines).join("\n");
		}
		if (!String(this._rec.sheet.langText || "").trim() && langLines.length) {
			this._rec.sheet.langText = uniqLines(langLines).join("\n");
		}

		// skills fixas (se o usuário ainda não marcou nada)
		if (!anyTrue(this._rec.sheet.skillProfs)) {
			const applyFixedSkillsFrom = (sp) => {
				const { fixed } = parseSkillProf(sp);
				for (const nm of fixed) {
					const k = SKILL_NAME_TO_KEY.get(String(nm).toLowerCase());
					if (k) this._rec.sheet.skillProfs[k] = true;
				}
			};

			if (race?.skillProficiencies) applyFixedSkillsFrom(race.skillProficiencies);
			if (subrace?.skillProficiencies) applyFixedSkillsFrom(subrace.skillProficiencies);
			if (bg?.skillProficiencies) applyFixedSkillsFrom(bg.skillProficiencies);
		}

		this._els.taProfs.value = this._rec.sheet.profsText || "";
		this._els.taLang.value = this._rec.sheet.langText || "";
	}

	async _pGetBrewClassCache () {
		if (this._brewClassCache) return this._brewClassCache;

		const out = { class: [], subclass: [], classFeature: [], subclassFeature: [] };

		try {
			if (PrereleaseUtil?.pGetBrewProcessed) {
				const pre = await PrereleaseUtil.pGetBrewProcessed();
				out.class.push(...normArr(pre?.class));
				out.subclass.push(...normArr(pre?.subclass));
				out.classFeature.push(...normArr(pre?.classFeature));
				out.subclassFeature.push(...normArr(pre?.subclassFeature));
			}
		} catch {}

		try {
			if (BrewUtil2?.pGetBrewProcessed) {
				const br = await BrewUtil2.pGetBrewProcessed();
				out.class.push(...normArr(br?.class));
				out.subclass.push(...normArr(br?.subclass));
				out.classFeature.push(...normArr(br?.classFeature));
				out.subclassFeature.push(...normArr(br?.subclassFeature));
			}
		} catch {}

		this._brewClassCache = out;
		return out;
	}

	async _pLoadRulesForRec (rec) {
		const choice = rec?.state?.choice || {};
		const clsChoice = choice.cls;
		const scChoice = choice.subclass;
		const brew = await this._pGetBrewClassCache();

		let fileJson = null;
		if (clsChoice) fileJson = await this._pLoadClassFileByName(clsChoice.name);

		const classEnt =
			(brew.class || []).find(c => c.name === clsChoice?.name && c.source === clsChoice?.source)
			|| (fileJson?.class || []).find(c => c.name === clsChoice?.name && c.source === clsChoice?.source)
			|| (brew.class || []).find(c => c.name === clsChoice?.name)
			|| (fileJson?.class || []).find(c => c.name === clsChoice?.name);

		const subclassEnt =
			(brew.subclass || []).find(s => s.name === scChoice?.name && s.source === scChoice?.source && s.className === clsChoice?.name)
			|| (fileJson?.subclass || []).find(s => s.name === scChoice?.name && s.source === scChoice?.source && s.className === clsChoice?.name)
			|| (brew.subclass || []).find(s => s.name === scChoice?.name && s.className === clsChoice?.name)
			|| (fileJson?.subclass || []).find(s => s.name === scChoice?.name && s.className === clsChoice?.name);

		const classFeatures = [
			...normArr(fileJson?.classFeature),
			...normArr(brew.classFeature),
		].filter(f =>
			f?.className === clsChoice?.name
			&& (!clsChoice?.source || f?.classSource === clsChoice.source)
		);

		const subclassFeatures = [
			...normArr(fileJson?.subclassFeature),
			...normArr(brew.subclassFeature),
		].filter(f =>
			f?.className === clsChoice?.name
			&& (!clsChoice?.source || f?.classSource === clsChoice.source)
		);

		return { classEnt, subclassEnt, classFeatures, subclassFeatures };
	}

	async _pLoadClassFileByName (className) {
		if (!className) return null;
		const idx = await fetch("data/class/index.json").then(r => r.json());
		const key = String(className || "").toLowerCase();
		const fn = idx[key];
		if (!fn) return null;
		return fetch(`data/class/${fn}`).then(r => r.json());
	}

	_maybeAutoFillSaveProfs () {
		const hasAny = Object.values(this._rec.sheet.saveProfs || {}).some(Boolean);
		if (hasAny) return;

		const profArr = this._rules?.classEnt?.proficiency;
		if (!Array.isArray(profArr) || !profArr.length) return;

		const set = {};
		for (const ab of profArr) {
			const k = String(ab || "").slice(0, 3).toLowerCase();
			if (ABILS.includes(k)) set[k] = true;
		}
		this._rec.sheet.saveProfs = set;
	}

	_renderFeatures (opts = {}) {
		const lvl = opts.forceLevel ?? (this._rec.sheet.level || 1);
		const openAll = !!opts.forceOpenAll;

		this._rec.sheet.ui = this._rec.sheet.ui || {};
		this._rec.sheet.ui.featureOpen = this._rec.sheet.ui.featureOpen || {};
		const openMap = this._rec.sheet.ui.featureOpen;

		const getOpen = (k, def = true) => openAll ? true : (openMap[k] ?? def);

		const r = Renderer.get();
		const choice = this._rec.state?.choice || {};

		const race = choice.species ? this._findRaceBase(choice.species.name, choice.species.source) : null;
		const subrace = (choice.species && choice.subrace)
			? this._findSubrace(choice.species.name, choice.species.source, choice.subrace.name, choice.subrace.source)
			: null;

		const bg = choice.background ? this._findBackground(choice.background.name, choice.background.source) : null;
		const feats = normArr(choice.feats).map(f => this._findFeat(f.name, f.source)).filter(Boolean);

		const classEnt = this._rules?.classEnt;
		const subclassEnt = this._rules?.subclassEnt;

		const norm = (s) => String(s ?? "").trim().toLowerCase();

		const isSubclassFeatureForSelected = (f) => {
			if (!subclassEnt) return false;

			const tName = norm(subclassEnt.name);
			const tShort = norm(subclassEnt.shortName || subclassEnt.subclassShortName || subclassEnt.name);
			const tSrc = norm(subclassEnt.source);

			const fShort = norm(f.subclassShortName);
			const fName = norm(f.subclassName);
			const fSrc = norm(f.subclassSource);

			const srcOk = (!f.subclassSource) || (!subclassEnt.source) || (fSrc === tSrc);
			const nameOk = fName && (fName === tName);
			const shortOk = fShort && (fShort === tShort || fShort === tName || tName.includes(fShort) || fShort.includes(tShort));

			return srcOk && (nameOk || shortOk);
		};

		const cfAny = (this._rules?.classFeatures || []).slice()
			.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
		const cfAtLvl = cfAny.filter(f => Number(f.level) <= lvl);

		const scfAny = (this._rules?.subclassFeatures || []).filter(isSubclassFeatureForSelected).slice()
			.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
		const scfAtLvl = scfAny.filter(f => Number(f.level) <= lvl);

		const mkKey = (...parts) => parts.map(p => String(p ?? "").replace(/\s+/g, " ").trim()).join("|");

		const renderFeat = (f, keyPrefix) => {
			const fKey = mkKey(keyPrefix, f.source || "", f.level, f.name);

			// ✅ i18n overlay (se existir)
			const isScf = f?.subclassShortName != null || f?.subclassName != null || f?.subclassSource != null;

			const nameDisp = isScf
				? (I18n.getSubclassFeatureName(f) || f.namePt || f.name)
				: (I18n.getClassFeatureName(f) || f.namePt || f.name);

			const entriesDisp = isScf
				? (I18n.getSubclassFeatureEntries(f) || f.entries)
				: (I18n.getClassFeatureEntries(f) || f.entries);

			const inner = entriesDisp ? r.render({ type: "entries", entries: entriesDisp }) : `<div class="cs__hint">(Sem conteúdo)</div>`;
			return `
			<details class="cs__feat" data-fkey="${esc(fKey)}" ${getOpen(fKey, false) ? "open" : ""}>
				<summary>${esc(nameDisp)} <span class="cs__feat-meta">• nív. ${esc(String(f.level))}</span></summary>
				<div class="ve-mt-2">${inner}</div>
			</details>
		`;
		};

		const renderEntity = (ent, label, keyPrefix) => {
			if (!ent) return `<div class="cs__hint">(nenhum)</div>`;
			const k = mkKey(keyPrefix, ent.source || "", ent.name || label || "entity");
			const body = ent.entries ? r.render({ type: "entries", entries: ent.entries }) : `<div class="cs__hint">(Sem conteúdo)</div>`;
			return `
			<details class="cs__feat" data-fkey="${esc(k)}" ${getOpen(k, true) ? "open" : ""}>
				<summary>${esc(label ?? ent.name)} <span class="cs__feat-meta">• ${esc(ent.source || "")}</span></summary>
				<div class="ve-mt-2">${body}</div>
			</details>
		`;
		};

		const renderSection = (id, title, innerHtml) => {
			const k = `sec:${id}`;
			return `
			<details class="cs__sec" id="cs_${esc(id)}" data-fkey="${esc(k)}" ${getOpen(k, true) ? "open" : ""}>
				<summary>${esc(title)}</summary>
				<div class="cs__sec-body">${innerHtml}</div>
			</details>
		`;
		};

		const sections = [];

		sections.push({ id: "race", title: "Raça", html: renderEntity(race, race?.namePt || race?.name || "Raça", "ent:race") });
		if (subrace) sections.push({ id: "subrace", title: "Sub-raça", html: renderEntity(subrace, (subrace?.namePt || subrace?.name) + " (Sub-raça)", "ent:subrace") });

		sections.push({
			id: "class",
			title: `Classe (mostrando até o nível ${lvl})`,
			html: classEnt
				? (cfAtLvl.length ? cfAtLvl.map(f => renderFeat(f, "cf")).join("") : `<div class="cs__hint">Nenhuma habilidade de classe encontrada.</div>`)
				: `<div class="cs__hint">(nenhum)</div>`,
		});

		let subclassHtml = `<div class="cs__hint">(nenhum)</div>`;
		if (subclassEnt) {
			const intro = renderEntity(subclassEnt, `Subclasse: ${subclassEnt.name}`, "ent:subclass");
			if (scfAtLvl.length) subclassHtml = `${intro}${scfAtLvl.map(f => renderFeat(f, "scf")).join("")}`;
			else if (scfAny.length) {
				const minLvl = Math.min(...scfAny.map(it => Number(it.level)).filter(Number.isFinite));
				subclassHtml = `${intro}<div class="cs__hint">Nenhuma habilidade de subclasse neste nível. Começa no nível ${isFinite(minLvl) ? minLvl : 3}.</div>`;
			} else subclassHtml = `${intro}<div class="cs__hint">Nenhuma habilidade de subclasse encontrada.</div>`;
		}
		sections.push({ id: "subclass", title: "Subclasse", html: subclassHtml });

		sections.push({
			id: "background",
			title: "Antecedente",
			html: bg ? renderEntity(bg, `Antecedente: ${bg?.namePt || bg?.name}`, "ent:bg"): `<div class="cs__hint">(nenhum)</div>`,
		});

		sections.push({
			id: "feats",
			title: "Talentos",
			html: feats.length
				? feats.map(ft => renderEntity(ft, `Talento: ${ft?.namePt || ft?.name}`, "ent:feat")).join("")
				: `<div class="cs__hint">(nenhum)</div>`,
		});

		const toc = `
		<div class="cs__toc">
			<div class="cs__hint"><b>Tópicos</b></div>
			<ul>
				${sections.map(s => {
			const label =
				s.id === "race" ? "Raça" :
					s.id === "subrace" ? "Sub-raça" :
						s.id === "class" ? "Classe" :
							s.id === "subclass" ? "Subclasse" :
								s.id === "background" ? "Antecedente" :
									s.id === "feats" ? "Talentos" :
										(s.id[0].toUpperCase() + s.id.slice(1));
			return `<li><a href="#cs_${esc(s.id)}">${esc(label)}</a></li>`;
		}).join("")}
			</ul>
		</div>
	`;

		this._els.features.innerHTML = [
			toc,
			...sections.map(s => renderSection(s.id, s.title, s.html)),
		].join("");

		// salva estado open/close quando usuário mexe
		this._els.features.querySelectorAll("details[data-fkey]").forEach(det => {
			det.addEventListener("toggle", () => {
				openMap[det.dataset.fkey] = det.open;
				this._pSaveDebounced();
			});
		});
	}

	async _pSaveRec () {
		if (!this._rec) return;

		this._rec.updatedAt = Date.now();
		await this._db.setItem(this._rec.id, {
			id: this._rec.id,
			name: this._rec.name,
			createdAt: this._rec.createdAt,
			updatedAt: this._rec.updatedAt,
			state: this._rec.state,
			sheet: this._rec.sheet,
		});

		this._els.metaRhs.textContent = `Salvo localmente • Atualizado: ${new Date(this._rec.updatedAt).toLocaleString()}`;
	}
}

window.addEventListener("load", async () => {
	const app = new SheetApp();
	await app.pInit();
	window.dbg_sheet = app;
});
