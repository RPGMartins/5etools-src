/* GPL note:
   This file builds a print sheet using a layout inspired by dungeontiger/d_d_characterSheets_5e (GPL-3.0).
*/
"use strict";

/* global localforage, Parser */

const DB_NAME = "rpgmartins_5etools";
const DB_STORE = "characters_v1";

const ABILS = ["str", "dex", "con", "int", "wis", "cha"];

const SKILLS = [
	{ key: "acrobatics", abil: "dex" },
	{ key: "animalHandling", abil: "wis" },
	{ key: "arcana", abil: "int" },
	{ key: "athletics", abil: "str" },
	{ key: "deception", abil: "cha" },
	{ key: "history", abil: "int" },
	{ key: "insight", abil: "wis" },
	{ key: "intimidation", abil: "cha" },
	{ key: "investigation", abil: "int" },
	{ key: "medicine", abil: "wis" },
	{ key: "nature", abil: "int" },
	{ key: "perception", abil: "wis" },
	{ key: "performance", abil: "cha" },
	{ key: "persuasion", abil: "cha" },
	{ key: "religion", abil: "int" },
	{ key: "sleightOfHand", abil: "dex" },
	{ key: "stealth", abil: "dex" },
	{ key: "survival", abil: "wis" },
];

const esc = (s) =>
	String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const modFromScore = (n) => Math.floor(((Number(n) || 10) - 10) / 2);
const fmtMod = (n) => (n >= 0 ? `+${n}` : `${n}`);
const profBonusFromLevel = (lvl) => 2 + Math.floor((Math.max(1, lvl) - 1) / 4);
const chk = (isOn) => (isOn ? "&#9745;" : "&#9744;"); // ☑/☐
const NBSP = "&nbsp;";

/* =========================
   i18n (UI PT-BR)
   ========================= */
let LANG = "ptbr";

const I18N = {
	en: {
		charSheet: "Character Sheet",
		name: "Name",
		classLevel: "Class & Level",
		background: "Background",
		playerName: "Player Name",
		race: "Race",
		subrace: "Subrace",
		alignment: "Alignment",
		experience: "Experience",
		size: "Size",
		combatStats: "Combat Stats",
		profBonus: "Prof. Bonus",
		inspiration: "Inspiration",
		initiative: "Initiative",
		hd: "HD",
		hp: "HP",
		spd: "Spd",
		ac: "AC",
		abilitySaves: "ABILITY SCORES & SAVING THROWS",
		skills: "Skills",
		profsBasics: "Proficiencies & Basics",
		currentStats: "Current Stats",
		deathSaves: "Death Saves",
		success: "Success",
		failures: "Failures",
		passivePerception: "Passive Perception",
		contents: "Contents",
		featuresUpTo: (lvl) => `FEATURES (UP TO LEVEL ${lvl})`,
		lvlShort: "lvl",
		skillsWord: "skills",
		feats: "Feats",
		class: "Class",
		subclass: "Subclass",
		proficiencies: "Proficiencies",
		languages: "Languages",
		notes: "Notes",
		featPrefix: "Feat",
		missingCfRef: "(Missing class feature ref.)",
		missingScfRef: "(Missing subclass feature ref.)",
	},
	ptbr: {
		charSheet: "Ficha de Personagem",
		name: "Nome",
		classLevel: "Classe e Nível",
		background: "Antecedente",
		playerName: "Nome do Jogador",
		race: "Raça",
		subrace: "Sub-raça",
		alignment: "Tendência",
		experience: "Experiência",
		size: "Tamanho",
		combatStats: "Combate",
		profBonus: "Bônus de Prof.",
		inspiration: "Inspiração",
		initiative: "Iniciativa",
		hd: "DV",
		hp: "PV",
		spd: "Desl.",
		ac: "CA",
		abilitySaves: "ATRIBUTOS & TESTES DE RESISTÊNCIA",
		skills: "Perícias",
		profsBasics: "Proficiências e Básico",
		currentStats: "Status",
		deathSaves: "Testes contra a Morte",
		success: "Sucessos",
		failures: "Falhas",
		passivePerception: "Percepção Passiva",
		contents: "Sumário",
		featuresUpTo: (lvl) => `HABILIDADES (ATÉ O NÍVEL ${lvl})`,
		lvlShort: "nív.",
		skillsWord: "perícias",
		feats: "Talentos",
		class: "Classe",
		subclass: "Subclasse",
		proficiencies: "Proficiências",
		languages: "Idiomas",
		notes: "Anotações",
		featPrefix: "Talento",
		missingCfRef: "(Referência de feature de classe ausente.)",
		missingScfRef: "(Referência de feature de subclasse ausente.)",
	},
};

const ABIL_ABV_BY_LANG = {
	en: { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" },
	ptbr: { str: "FOR", dex: "DES", con: "CON", int: "INT", wis: "SAB", cha: "CAR" },
};

const SKILL_NAMES_BY_LANG = {
	en: {
		acrobatics: "Acrobatics",
		animalHandling: "Animal Handling",
		arcana: "Arcana",
		athletics: "Athletics",
		deception: "Deception",
		history: "History",
		insight: "Insight",
		intimidation: "Intimidation",
		investigation: "Investigation",
		medicine: "Medicine",
		nature: "Nature",
		perception: "Perception",
		performance: "Performance",
		persuasion: "Persuasion",
		religion: "Religion",
		sleightOfHand: "Sleight of Hand",
		stealth: "Stealth",
		survival: "Survival",
	},
	ptbr: {
		acrobatics: "Acrobacias",
		animalHandling: "Adestramento",
		arcana: "Arcanismo",
		athletics: "Atletismo",
		deception: "Enganação",
		history: "História",
		insight: "Intuição",
		intimidation: "Intimidação",
		investigation: "Investigação",
		medicine: "Medicina",
		nature: "Natureza",
		perception: "Percepção",
		performance: "Atuação",
		persuasion: "Persuasão",
		religion: "Religião",
		sleightOfHand: "Prestidigitação",
		stealth: "Furtividade",
		survival: "Sobrevivência",
	},
};

const SIZE_FULL_PT = { T: "Minúsculo", S: "Pequeno", M: "Médio", L: "Grande", H: "Enorme", G: "Colossal" };

function t (key, ...args) {
	const pack = I18N[LANG] || I18N.en;
	const v = pack[key] ?? I18N.en[key] ?? key;
	return typeof v === "function" ? v(...args) : v;
}

function abilAbv (k) {
	return (ABIL_ABV_BY_LANG[LANG] || ABIL_ABV_BY_LANG.en)[k] || k.toUpperCase();
}

function skillName (k) {
	return (SKILL_NAMES_BY_LANG[LANG] || SKILL_NAMES_BY_LANG.en)[k] || k;
}

/* =========================
   Params + blank helper
   ========================= */
function getParams () {
	const u = new URL(location.href);
	const lang = (u.searchParams.get("lang") || "ptbr").toLowerCase();
	LANG = lang === "en" ? "en" : "ptbr";

	return {
		id: u.searchParams.get("id"),
		lvl: u.searchParams.get("lvl"),
		auto: u.searchParams.get("auto") === "1",
		features: u.searchParams.get("features") === "1",
		blank: u.searchParams.get("blank") === "1",
		lang: LANG,
	};
}

function vBlank (isBlank, val) {
	return isBlank ? NBSP : val;
}

/* =========================
   Fetch caches
   ========================= */
let __RACES_CACHE = null;
let __BGS_CACHE = null;
let __FEATS_CACHE = null;
let __CLASS_INDEX_CACHE = null;

async function pLoadRaces () {
	if (__RACES_CACHE) return __RACES_CACHE;
	const json = await fetch("data/races.json").then((r) => r.json());
	__RACES_CACHE = Array.isArray(json.race) ? json.race : [];
	return __RACES_CACHE;
}

async function pLoadBackgrounds () {
	if (__BGS_CACHE) return __BGS_CACHE;
	const json = await fetch("data/backgrounds.json").then((r) => r.json());
	__BGS_CACHE = Array.isArray(json.background) ? json.background : [];
	return __BGS_CACHE;
}

async function pLoadFeats () {
	if (__FEATS_CACHE) return __FEATS_CACHE;
	const json = await fetch("data/feats.json").then((r) => r.json());
	__FEATS_CACHE = Array.isArray(json.feat) ? json.feat : [];
	return __FEATS_CACHE;
}

async function pLoadClassIndex () {
	if (__CLASS_INDEX_CACHE) return __CLASS_INDEX_CACHE;
	__CLASS_INDEX_CACHE = await fetch("data/class/index.json").then((r) => r.json());
	return __CLASS_INDEX_CACHE;
}

async function pLoadClassFileByName (className) {
	if (!className) return null;
	const idx = await pLoadClassIndex();
	const fn = idx[String(className).toLowerCase()];
	if (!fn) return null;
	return fetch(`data/class/${fn}`).then((r) => r.json());
}

/* =========================
   Race helpers (size/speed)
   ========================= */
function findRaceBase (races, name, source) {
	if (!name) return null;
	return (
		races.find((r) => r.name === name && r.source === source && !r.raceName) ||
		races.find((r) => r.name === name && r.source === source) ||
		races.find((r) => r.name === name)
	);
}

function findSubrace (races, baseName, baseSource, subName, subSource) {
	if (!subName || !baseName) return null;
	return (
		races.find(
			(r) =>
				r.name === subName &&
				r.source === subSource &&
				r.raceName === baseName &&
				(r.raceSource || baseSource) === baseSource,
		) ||
		races.find(
			(r) => r.name === subName && r.source === subSource && r.raceName === baseName,
		)
	);
}

function fmtSize (size) {
	const code = Array.isArray(size) ? size[0] : size;
	if (!code) return "";
	if (LANG === "ptbr") return SIZE_FULL_PT[code] || String(code);

	try {
		if (Parser?.sizeAbvToFull) return Parser.sizeAbvToFull(code);
	} catch {}
	const map = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };
	return map[code] || String(code);
}

function fmtSpeed (speed) {
	if (speed == null) return "";
	if (typeof speed === "number") return String(speed);

	if (typeof speed === "object") {
		const parts = [];
		const walk = speed.walk ?? speed.speed;
		if (typeof walk === "number") parts.push(String(walk));
		for (const [k, v] of Object.entries(speed)) {
			if (k === "walk" || k === "speed" || k === "note") continue;
			if (typeof v === "number") parts.push(`${k} ${v}`);
		}
		return parts.join(", ");
	}
	return String(speed);
}

/* =========================
   Lite renderer for entries (NO Renderer)
   - strips {@...} tags
   - entries blocks are collapsible
   ========================= */
function strip5eTags (s) {
	if (!s) return "";
	let out = String(s);

	out = out.replace(/\{@([a-zA-Z]+)\s([^}]+)\}/g, (_, __tag, body) => {
		const main = String(body).split("|")[0];
		return main;
	});

	out = out.replace(/[{}]/g, "");
	return out;
}

function buildFeatureRefMaps (classFile) {
	const classFeatureMap = new Map();
	const subclassFeatureMap = new Map();

	const cfs = Array.isArray(classFile?.classFeature) ? classFile.classFeature : [];
	const scfs = Array.isArray(classFile?.subclassFeature) ? classFile.subclassFeature : [];

	for (const f of cfs) {
		const base = `${f.name}|${f.className}|${f.classSource}|${f.level}`;
		const keyA = `${base}|${f.source || ""}`.toLowerCase();
		const keyB = `${base}`.toLowerCase();
		classFeatureMap.set(keyA, f);
		classFeatureMap.set(keyB, f);
	}

	for (const f of scfs) {
		const subShort = f.subclassShortName || f.subclassName || "";
		const base = `${f.name}|${f.className}|${f.classSource}|${subShort}|${f.subclassSource || ""}|${f.level}`;
		const keyA = base.toLowerCase();
		subclassFeatureMap.set(keyA, f);
	}

	return { classFeatureMap, subclassFeatureMap };
}

function renderEntriesLite (entries, ctx) {
	if (entries == null) return "";
	if (typeof entries === "string") {
		return `<div class="gpl-feat-p">${esc(strip5eTags(entries))}</div>`;
	}

	if (Array.isArray(entries)) return entries.map((it) => renderEntriesLite(it, ctx)).join("");

	if (typeof entries !== "object") return "";

	if (entries.type === "refClassFeature" && entries.classFeature && ctx?.classFeatureMap) {
		const k = String(entries.classFeature).toLowerCase();
		const ref = ctx.classFeatureMap.get(k);
		if (ref?.entries) return renderEntriesLite(ref.entries, ctx);
		return `<div class="gpl-feat-p">${esc(t("missingCfRef"))}</div>`;
	}

	if (entries.type === "refSubclassFeature" && entries.subclassFeature && ctx?.subclassFeatureMap) {
		const k = String(entries.subclassFeature).toLowerCase();
		const ref = ctx.subclassFeatureMap.get(k);
		if (ref?.entries) return renderEntriesLite(ref.entries, ctx);
		return `<div class="gpl-feat-p">${esc(t("missingScfRef"))}</div>`;
	}

	if (entries.type === "entries") {
		if (entries.name) {
			const title = esc(strip5eTags(entries.name));
			const body = renderEntriesLite(entries.entries, ctx);
			return `
				<details class="gpl-entry" open>
					<summary>${title}</summary>
					<div class="gpl-entry-body">${body}</div>
				</details>
			`;
		}
		return renderEntriesLite(entries.entries, ctx);
	}

	if (entries.type === "list") {
		const items = (entries.items || [])
			.map((it) => {
				if (typeof it === "string") return `<li>${esc(strip5eTags(it))}</li>`;
				if (it?.type === "item") {
					const nm = it.name ? `<b>${esc(strip5eTags(it.name))}.</b> ` : "";
					const body = it.entry ? esc(strip5eTags(it.entry)) : "";
					const extra = it.entries ? renderEntriesLite(it.entries, ctx) : "";
					return `<li>${nm}${body}${extra ? `<div>${extra}</div>` : ""}</li>`;
				}
				return `<li>${renderEntriesLite(it, ctx)}</li>`;
			})
			.join("");
		return `<ul class="gpl-feat-ul">${items}</ul>`;
	}

	if (entries.type === "item") {
		const nm = entries.name
			? `<div class="gpl-feat-block-title">${esc(strip5eTags(entries.name))}</div>`
			: "";
		const body = entries.entry
			? `<div class="gpl-feat-p">${esc(strip5eTags(entries.entry))}</div>`
			: "";
		const extra = entries.entries ? renderEntriesLite(entries.entries, ctx) : "";
		return `${nm}${body}${extra}`;
	}

	if (entries.type === "table") {
		const caption = entries.caption
			? `<div class="gpl-feat-block-title">${esc(strip5eTags(entries.caption))}</div>`
			: "";
		const colLabels = entries.colLabels || [];
		const rows = entries.rows || [];

		const head = colLabels.length
			? `<tr>${colLabels.map((c) => `<th>${esc(strip5eTags(c))}</th>`).join("")}</tr>`
			: "";

		const bodyRows = rows
			.map((row) => {
				const cells = (Array.isArray(row) ? row : [row])
					.map((c) => `<td>${esc(strip5eTags(c))}</td>`)
					.join("");
				return `<tr>${cells}</tr>`;
			})
			.join("");

		return `${caption}<table class="gpl-feat-table">${head}${bodyRows}</table>`;
	}

	if (entries.type === "quote" || entries.type === "inset") {
		return `<div class="gpl-feat-quote">${renderEntriesLite(entries.entries, ctx)}</div>`;
	}

	if (entries.entries) return renderEntriesLite(entries.entries, ctx);
	return "";
}

/* =========================
   Subclass matching
   ========================= */
function findSubclassEnt (classFile, clsChoice, scChoice) {
	if (!classFile?.subclass || !clsChoice || !scChoice) return null;
	return (
		classFile.subclass.find(
			(sc) =>
				sc.name === scChoice.name &&
				sc.source === scChoice.source &&
				sc.className === clsChoice.name,
		) ||
		classFile.subclass.find((sc) => sc.name === scChoice.name && sc.className === clsChoice.name)
	);
}

function isSubclassFeatureMatch (f, subclassEnt, scChoice) {
	if (!f || (!subclassEnt && !scChoice)) return false;

	const norm = (s) => String(s || "").trim().toLowerCase();
	const selName = norm(subclassEnt?.name ?? scChoice?.name);
	const selShort = norm(subclassEnt?.shortName ?? subclassEnt?.subclassShortName ?? scChoice?.name);
	const selSource = norm(subclassEnt?.source ?? scChoice?.source);

	const fShort = norm(f.subclassShortName);
	const fName = norm(f.subclassName);
	const fSource = norm(f.subclassSource);

	const srcOk = !f.subclassSource || !selSource || fSource === selSource;
	const nameOk = fName && fName === selName;
	const shortOk =
		fShort &&
		(fShort === selShort ||
			fShort === selName ||
			selName.includes(fShort) ||
			fShort.includes(selShort));

	return srcOk && (nameOk || shortOk);
}

/* =========================
   Print blocks
   ========================= */
function nameTable (name) {
	return `
		<table class="tableBox">
			<tr class="tableValueBox"><td>${esc(name)}</td></tr>
			<tr><td class="label">${esc(t("name"))}</td></tr>
		</table>
	`;
}

function introBlock (meta) {
	return `
		<table class="tableBox">
			<tr class="tableValueBox">
				<td class="oneThird">${esc(meta.classLevel)}</td>
				<td class="oneThird">${esc(meta.background)}</td>
				<td class="oneThird">${esc(meta.playerName)}</td>
			</tr>
			<tr>
				<td class="label">${esc(t("classLevel"))}</td>
				<td class="label">${esc(t("background"))}</td>
				<td class="label">${esc(t("playerName"))}</td>
			</tr>
		</table>

		<table class="tableBox">
			<tr class="tableValueBox">
				<td class="oneThird">${esc(meta.race)}</td>
				<td class="oneThird">${esc(meta.alignment)}</td>
				<td class="oneThird">${esc(meta.experience)}</td>
			</tr>
			<tr>
				<td class="label">${esc(t("race"))}</td>
				<td class="label">${esc(t("alignment"))}</td>
				<td class="label">${esc(t("experience"))}</td>
			</tr>
		</table>

		<table class="tableBox">
			<tr class="tableValueBox">
				<td>${esc(meta.size)}</td>
			</tr>
			<tr>
				<td class="label">${esc(t("size"))}</td>
			</tr>
		</table>
	`;
}

function combatStats (pb, dexMod, speed, isBlank) {
	return `
		<div class="header">${esc(t("combatStats"))}</div>
		<table class="tableBox">
			<tr class="tableValueBox">
				<td class="oneEight">${vBlank(isBlank, `+${pb}`)}</td>
				<td class="oneEight"></td>
				<td class="oneEight">${vBlank(isBlank, fmtMod(dexMod))}</td>
				<td class="oneEight"></td>
				<td class="oneEight"></td>
				<td class="oneEight">${esc(speed || "")}</td>
				<td class="oneEight"></td>
			</tr>
			<tr>
				<td class="label">${esc(t("profBonus"))}</td>
				<td class="label">${esc(t("inspiration"))}</td>
				<td class="label">${esc(t("initiative"))}</td>
				<td class="label">${esc(t("hd"))}</td>
				<td class="label">${esc(t("hp"))}</td>
				<td class="label">${esc(t("spd"))}</td>
				<td class="label">${esc(t("ac"))}</td>
			</tr>
		</table>
	`;
}

function abilityAndSaves (ab, saveProfs, pb, isBlank) {
	const mods = {};
	for (const k of ABILS) mods[k] = modFromScore(ab[k]);

	const saves = {};
	for (const k of ABILS) {
		const isProf = !!saveProfs?.[k];
		saves[k] = mods[k] + (isProf ? pb : 0);
	}

	const cells = ABILS.map((k) => {
		const isProf = !!saveProfs?.[k];

		const x = isBlank ? "" : isProf ? "X" : "o";
		const modTxt = isBlank ? "" : fmtMod(mods[k]);
		const saveTxt = isBlank ? "" : fmtMod(saves[k]);
		const scoreTxt = isBlank ? "" : String(ab[k] ?? 10);

		const nameTxt = abilAbv(k);

		return `
			<td class="gpl-abil-card">
				<div class="gpl-abil-card-inner">
					<div class="gpl-abil-save">${x || NBSP}</div>
					<div class="gpl-abil-saveval">${saveTxt ? esc(saveTxt) : NBSP}</div>
					<div class="gpl-abil-mod">${modTxt ? esc(modTxt) : NBSP}</div>
					<div class="gpl-abil-name">${esc(nameTxt)}</div>
					<div class="gpl-abil-score">${scoreTxt ? esc(scoreTxt) : NBSP}</div>
				</div>
			</td>
		`;
	}).join("");

	return `
		<div class="header">${esc(t("abilitySaves"))}</div>
		<table class="gpl-abil-grid">
			<tr>${cells}</tr>
		</table>
	`;
}

function skillsBlock (ab, skillProfs, pb, isBlank) {
	const mods = {};
	for (const k of ABILS) mods[k] = modFromScore(ab[k]);

	const groupsOrder = ["str", "dex", "con", "int", "wis", "cha"];

	const groups = new Map(groupsOrder.map((k) => [k, []]));
	for (const sk of SKILLS) if (groups.has(sk.abil)) groups.get(sk.abil).push(sk);
	for (const k of groupsOrder) groups.get(k).sort((a, b) => skillName(a.key).localeCompare(skillName(b.key)));

	let alt = false;

	const renderGroup = (abil) => {
		const arr = groups.get(abil) || [];
		if (!arr.length) return "";

		const rows = arr
			.map((sk) => {
				const total = mods[sk.abil] + (skillProfs?.[sk.key] ? pb : 0);
				const mark = isBlank ? chk(false) : chk(!!skillProfs?.[sk.key]);
				const val = isBlank ? NBSP : esc(fmtMod(total));

				return `
					<tr>
						<td class="gpl-skill-col-chk">${mark}</td>
						<td class="gpl-skill-col-mod">${val}</td>
						<td>${esc(skillName(sk.key))}</td>
					</tr>
				`;
			})
			.join("");

		const table = `
			<table class="gpl-skill-group ${alt ? "gpl-skill-group--alt" : ""}">
				<tr class="gpl-skill-group-hdr">
					<td colspan="3">${esc(abilAbv(abil))} ${esc(t("skillsWord"))}</td>
				</tr>
				${rows}
			</table>
		`;

		alt = !alt;
		return table;
	};

	const blocks = groupsOrder.map(renderGroup).filter(Boolean);

	const passivePerception = 10 + mods.wis + (skillProfs?.perception ? pb : 0);
	const ppVal = isBlank ? NBSP : esc(String(passivePerception));

	blocks.push(`
		<table class="gpl-skill-group gpl-skill-passive">
			<tr class="gpl-skill-group-hdr">
				<td colspan="3">PASSIVE</td>
			</tr>
			<tr>
				<td class="gpl-skill-col-chk"></td>
				<td class="gpl-skill-col-mod">${ppVal}</td>
				<td>${esc(t("passivePerception"))} (${esc(abilAbv("wis"))})</td>
			</tr>
		</table>
	`);

	return blocks.join("");
}

function drawSkillsTriple (rec, lvl, pb, isBlank) {
	const ab = rec.sheet?.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
	const skillProfs = rec.sheet?.skillProfs || {};

	const profs = (rec.sheet?.profsText || "").trim().split("\n").filter(Boolean).join(" | ");
	const langs = (rec.sheet?.langText || "").trim().split("\n").filter(Boolean).join(" | ");
	const notes = (rec.sheet?.notes || "").trim();

	const choice = rec.state?.choice || {};
	const cls = choice.cls?.name ? `${choice.cls.name}` : "";
	const sub = choice.subclass?.name ? ` / ${choice.subclass.name}` : "";
	const race = choice.species?.name ? `${choice.species.name}` : "";
	const bg = choice.background?.name ? `${choice.background.name}` : "";
	const feats = (choice.feats || []).map((f) => f?.name).filter(Boolean).join(", ");

	const classLine = isBlank
		? `${cls || "—"} ____${choice.subclass?.name ? ` (${choice.subclass.name})` : ""}`
		: `${cls || "—"}${sub} (${t("lvlShort")} ${lvl})`;

	const midTop = `
		<tr><td><b>${esc(t("class"))}</b>: ${esc(classLine)}</td></tr>
		<tr><td><b>${esc(t("race"))}</b>: ${esc(race || "—")}</td></tr>
		<tr><td><b>${esc(t("background"))}</b>: ${esc(bg || "—")}</td></tr>
		<tr><td><b>${esc(t("feats"))}</b>: ${esc(feats || "—")}</td></tr>
		<tr><td><b>${esc(t("proficiencies"))}</b>: ${esc(profs || "—")}</td></tr>
		<tr><td><b>${esc(t("languages"))}</b>: ${esc(langs || "—")}</td></tr>
		${notes ? `<tr><td><b>${esc(t("notes"))}</b>: ${esc(notes)}</td></tr>` : ""}
	`;

	return `
		<table>
			<tr>
				<td><div class="header">${esc(t("skills"))}</div></td>
				<td style="width:100%" class="header">${esc(t("profsBasics"))}</td>
				<td><div class="header">${esc(t("currentStats"))}</div></td>
			</tr>
			<tr>
				<td valign="top">${skillsBlock(ab, skillProfs, pb, isBlank)}</td>
				<td valign="top"><table>${midTop}</table></td>
				<td valign="top">
					<table>
						<tr class="tableValueBox"><td></td></tr>
						<tr><td class="label">${esc(t("hp"))}</td></tr>

						<tr class="tableValueBox"><td></td></tr>
						<tr><td class="label">${esc(t("ac"))}</td></tr>

						<tr class="tableValueBox">
							<td>
								<table>
									<tr><td class="small">${esc(t("success"))}:</td><td>&#9723;&#9723;&#9723;</td></tr>
									<tr><td class="small">${esc(t("failures"))}:</td><td>&#9723;&#9723;&#9723;</td></tr>
								</table>
							</td>
						</tr>
						<tr><td class="label">${esc(t("deathSaves"))}</td></tr>
					</table>
				</td>
			</tr>
		</table>
	`;
}

/* =========================
   Features pages: TOC + counts + collapsible groups/items
   ========================= */
function countNamedEntrySections (entries) {
	const set = new Set();
	const walk = (node, depth = 0) => {
		if (node == null || depth > 4) return;
		if (typeof node === "string") return;
		if (Array.isArray(node)) return node.forEach((n) => walk(n, depth));
		if (typeof node === "object") {
			if (node.name && typeof node.name === "string") set.add(node.name);
			if (node.entries) walk(node.entries, depth + 1);
			if (node.items) walk(node.items, depth + 1);
		}
	};
	walk(entries, 0);
	return set.size;
}

function renderFeatureToc (items) {
	const fmt = (it) => {
		const n = Number(it.count ?? 0);
		const suffix = Number.isFinite(n) ? ` (${n})` : "";
		return `<li><a href="#${esc(it.id)}">${esc(it.title)}${esc(suffix)}</a></li>`;
	};

	return `
		<div class="gpl-feat-toc">
			<div class="gpl-feat-toc-title">${esc(t("contents"))}</div>
			<ul>${items.map(fmt).join("")}</ul>
		</div>
	`;
}

function renderFeatureSection (id, title, innerHtml, isOpen = true) {
	return `
		<details class="gpl-sec" id="${esc(id)}" ${isOpen ? "open" : ""}>
			<summary>${esc(title)}</summary>
			<div class="gpl-sec-body">${innerHtml || `<div class="gpl-feat-p">(none)</div>`}</div>
		</details>
	`;
}

function renderFeaturesPages (data) {
	const { race, subrace, bg, feats, classFeatures, subclassFeatures, ctx, lvl } = data;

	const raceCount = race?.entries ? countNamedEntrySections(race.entries) : 0;
	const subraceCount = subrace?.entries ? countNamedEntrySections(subrace.entries) : 0;
	const bgCount = bg?.entries ? countNamedEntrySections(bg.entries) : 0;

	const featsCount = (feats || []).length;
	const classCount = (classFeatures || []).length;
	const subclassCount = (subclassFeatures || []).length;

	const tocItems = [
		{ id: "feat_race", title: t("race"), count: raceCount },
		...(subrace ? [{ id: "feat_subrace", title: t("subrace"), count: subraceCount }] : []),
		{ id: "feat_background", title: t("background"), count: bgCount },
		{ id: "feat_feats", title: t("feats"), count: featsCount },
		{ id: "feat_class", title: t("class"), count: classCount },
		{ id: "feat_subclass", title: t("subclass"), count: subclassCount },
	];

	const raceHtml = race ? renderEntriesLite(race.entries, ctx) : "";
	const subraceHtml = subrace ? renderEntriesLite(subrace.entries, ctx) : "";
	const bgHtml = bg ? renderEntriesLite(bg.entries, ctx) : "";

	const featsHtml = (feats || [])
		.map((ft) => {
			const body = ft.entries ? renderEntriesLite(ft.entries, ctx) : "";
			return `
				<details class="gpl-item" open>
					<summary>${esc(t("featPrefix"))}: ${esc(ft.name)} (${esc(ft.source || "")})</summary>
					<div class="gpl-item-body">${body || `<div class="gpl-feat-p">(none)</div>`}</div>
				</details>
			`;
		})
		.join("");

	const classHtml = (classFeatures || [])
		.map((f) => {
			const body = f.entries ? renderEntriesLite(f.entries, ctx) : "";
			return `
				<details class="gpl-item" open>
					<summary>${esc(f.name)} (${esc(t("lvlShort"))} ${esc(String(f.level))})</summary>
					<div class="gpl-item-body">${body || `<div class="gpl-feat-p">(none)</div>`}</div>
				</details>
			`;
		})
		.join("");

	const subclassHtml = (subclassFeatures || [])
		.map((f) => {
			const body = f.entries ? renderEntriesLite(f.entries, ctx) : "";
			return `
				<details class="gpl-item" open>
					<summary>${esc(f.name)} (${esc(t("lvlShort"))} ${esc(String(f.level))})</summary>
					<div class="gpl-item-body">${body || `<div class="gpl-feat-p">(none)</div>`}</div>
				</details>
			`;
		})
		.join("");

	const parts = [];

	// start features in a new page
	parts.push(`<div class="page-break"></div>`);
	parts.push(`<div class="gpl-feat-wrap gpl-feat-wrap--compact">`);
	parts.push(`<div class="header">${esc(t("featuresUpTo", String(lvl)))}</div>`);

	// TOC (hidden in print by CSS)
	parts.push(renderFeatureToc(tocItems));

	// part 1: race/subrace/background/feats
	parts.push(renderFeatureSection("feat_race", t("race"), raceHtml, true));
	if (subrace) parts.push(renderFeatureSection("feat_subrace", t("subrace"), subraceHtml, true));
	parts.push(renderFeatureSection("feat_background", t("background"), bgHtml, true));
	parts.push(renderFeatureSection("feat_feats", t("feats"), featsHtml, true));

	// page break before class
	parts.push(`<div class="page-break"></div>`);

	// part 2: class/subclass
	parts.push(renderFeatureSection("feat_class", t("class"), classHtml, true));
	parts.push(renderFeatureSection("feat_subclass", t("subclass"), subclassHtml, true));

	parts.push(`</div>`);
	return parts.join("");
}

/* =========================
   Open all details when printing
   ========================= */
function setAllDetailsOpen (isOpen) {
	document.querySelectorAll("details").forEach((d) => {
		d.open = !!isOpen;
	});
}

window.addEventListener("beforeprint", () => setAllDetailsOpen(true));

/* =========================
   Main
   ========================= */
async function main () {
	const { id, lvl: lvlRaw, auto, features, blank } = getParams();
	if (!id) {
		document.getElementById("gpl_sheet").innerHTML = "<b>Missing ?id=</b>";
		return;
	}

	const db = localforage.createInstance({ name: DB_NAME, storeName: DB_STORE });
	const rec = await db.getItem(id);
	if (!rec) {
		document.getElementById("gpl_sheet").innerHTML = "<b>Character not found</b>";
		return;
	}

	rec.sheet = rec.sheet || {};
	rec.sheet.abilities = rec.sheet.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
	rec.sheet.saveProfs = rec.sheet.saveProfs || {};
	rec.sheet.skillProfs = rec.sheet.skillProfs || {};

	const lvl = Number(lvlRaw) || Number(rec.sheet.level) || 1;
	const pb = profBonusFromLevel(lvl);

	const choice = rec.state?.choice || {};

	// size/speed from race
	const races = await pLoadRaces();
	const sp = choice.species;
	const sr = choice.subrace;

	const baseRace = sp ? findRaceBase(races, sp.name, sp.source) : null;
	const subRace = sp && sr ? findSubrace(races, sp.name, sp.source, sr.name, sr.source) : null;

	const sizeStr = fmtSize(subRace?.size ?? baseRace?.size);
	const speedStr = fmtSpeed(subRace?.speed ?? baseRace?.speed);

	const dexMod = modFromScore(rec.sheet.abilities.dex);

	// header strings (blank-friendly)
	const clsName = choice.cls?.name || "—";
	const subclassName = choice.subclass?.name ? ` (${choice.subclass.name})` : "";
	const classLevel = blank ? `${clsName} ____${subclassName}` : `${clsName} ${lvl}${subclassName}`;

	const raceStr = `${choice.species?.name || "—"}${choice.subrace?.name ? ` (${choice.subrace.name})` : ""}`;
	const bgStr = choice.background?.name || "—";

	const htmlParts = [];
	htmlParts.push(`<div class="center title">${esc(t("charSheet"))}</div>`);
	htmlParts.push(nameTable(rec.name || rec.state?.meta?.name || "Unnamed"));
	htmlParts.push(
		introBlock({
			classLevel,
			background: bgStr,
			playerName: "",
			race: raceStr,
			alignment: "",   // você pode preencher depois
			experience: "",  // você pode preencher depois
			size: sizeStr,
		}),
	);
	htmlParts.push(combatStats(pb, dexMod, speedStr, blank));
	htmlParts.push(abilityAndSaves(rec.sheet.abilities, rec.sheet.saveProfs, pb, blank));
	htmlParts.push(drawSkillsTriple(rec, lvl, pb, blank));

	// features pages (entries completas)
	if (features) {
		const bgs = await pLoadBackgrounds();
		const featsAll = await pLoadFeats();

		const bgEnt = choice.background
			? bgs.find((b) => b.name === choice.background.name && b.source === choice.background.source) ||
			bgs.find((b) => b.name === choice.background.name)
			: null;

		const featEnts = (Array.isArray(choice.feats) ? choice.feats : [])
			.map((f) => featsAll.find((x) => x.name === f.name && x.source === f.source) || featsAll.find((x) => x.name === f.name))
			.filter(Boolean);

		let classFeatures = [];
		let subclassFeatures = [];
		let ctx = {};

		if (choice.cls?.name) {
			const classFile = await pLoadClassFileByName(choice.cls.name);
			if (classFile) {
				ctx = buildFeatureRefMaps(classFile);

				const cfs = Array.isArray(classFile.classFeature) ? classFile.classFeature : [];
				classFeatures = cfs
					.filter((f) => f.className === choice.cls.name)
					.filter((f) => !choice.cls.source || f.classSource === choice.cls.source)
					.filter((f) => Number(f.level) <= lvl)
					.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

				const scfs = Array.isArray(classFile.subclassFeature) ? classFile.subclassFeature : [];
				const subclassEnt = findSubclassEnt(classFile, choice.cls, choice.subclass);

				subclassFeatures = scfs
					.filter((f) => f.className === choice.cls.name)
					.filter((f) => !choice.cls.source || f.classSource === choice.cls.source)
					.filter((f) => Number(f.level) <= lvl)
					.filter((f) => isSubclassFeatureMatch(f, subclassEnt, choice.subclass))
					.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
			}
		}

		htmlParts.push(
			renderFeaturesPages({
				race: baseRace,
				subrace: subRace,
				bg: bgEnt,
				feats: featEnts,
				classFeatures,
				subclassFeatures,
				ctx,
				lvl,
			}),
		);
	}

	document.getElementById("gpl_sheet").innerHTML = htmlParts.join("\n");

	if (auto) {
		setAllDetailsOpen(true);
		setTimeout(() => window.print(), 50);
	}
}

main();
