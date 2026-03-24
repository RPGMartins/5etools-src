/* GPL note:
   This file builds a print sheet using a layout inspired by dungeontiger/d_d_characterSheets_5e (GPL-3.0).
*/
"use strict";

/* global localforage, Parser */

const DB_NAME = "rpgmartins_5etools";
const DB_STORE = "characters_v1";

const ABILS = ["str","dex","con","int","wis","cha"];
const ABIL_LABEL = {str:"Str", dex:"Dex", con:"Con", int:"Int", wis:"Wis", cha:"Cha"};

const SKILLS = [
	{key:"acrobatics", name:"Acrobatics", abil:"dex"},
	{key:"animalHandling", name:"Animal Handling", abil:"wis"},
	{key:"arcana", name:"Arcana", abil:"int"},
	{key:"athletics", name:"Athletics", abil:"str"},
	{key:"deception", name:"Deception", abil:"cha"},
	{key:"history", name:"History", abil:"int"},
	{key:"insight", name:"Insight", abil:"wis"},
	{key:"intimidation", name:"Intimidation", abil:"cha"},
	{key:"investigation", name:"Investigation", abil:"int"},
	{key:"medicine", name:"Medicine", abil:"wis"},
	{key:"nature", name:"Nature", abil:"int"},
	{key:"perception", name:"Perception", abil:"wis"},
	{key:"performance", name:"Performance", abil:"cha"},
	{key:"persuasion", name:"Persuasion", abil:"cha"},
	{key:"religion", name:"Religion", abil:"int"},
	{key:"sleightOfHand", name:"Sleight of Hand", abil:"dex"},
	{key:"stealth", name:"Stealth", abil:"dex"},
	{key:"survival", name:"Survival", abil:"wis"},
];

const esc = (s) => String(s ?? "")
	.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
	.replace(/"/g,"&quot;").replace(/'/g,"&#039;");

const modFromScore = (n) => Math.floor(((Number(n) || 10) - 10) / 2);
const fmtMod = (n) => n >= 0 ? `+${n}` : `${n}`;
const profBonusFromLevel = (lvl) => 2 + Math.floor((Math.max(1, lvl) - 1) / 4);
const chk = (isOn) => isOn ? "&#9745;" : "&#9744;"; // ☑/☐

/* =========================
   Fetch caches
   ========================= */
let __RACES_CACHE = null;
let __BGS_CACHE = null;
let __FEATS_CACHE = null;
let __CLASS_INDEX_CACHE = null;

async function pLoadRaces () {
	if (__RACES_CACHE) return __RACES_CACHE;
	const json = await fetch("data/races.json").then(r => r.json());
	__RACES_CACHE = Array.isArray(json.race) ? json.race : [];
	return __RACES_CACHE;
}

async function pLoadBackgrounds () {
	if (__BGS_CACHE) return __BGS_CACHE;
	const json = await fetch("data/backgrounds.json").then(r => r.json());
	__BGS_CACHE = Array.isArray(json.background) ? json.background : [];
	return __BGS_CACHE;
}

async function pLoadFeats () {
	if (__FEATS_CACHE) return __FEATS_CACHE;
	const json = await fetch("data/feats.json").then(r => r.json());
	__FEATS_CACHE = Array.isArray(json.feat) ? json.feat : [];
	return __FEATS_CACHE;
}

async function pLoadClassIndex () {
	if (__CLASS_INDEX_CACHE) return __CLASS_INDEX_CACHE;
	__CLASS_INDEX_CACHE = await fetch("data/class/index.json").then(r => r.json());
	return __CLASS_INDEX_CACHE;
}

async function pLoadClassFileByName (className) {
	if (!className) return null;
	const idx = await pLoadClassIndex();
	const fn = idx[String(className).toLowerCase()];
	if (!fn) return null;
	return fetch(`data/class/${fn}`).then(r => r.json());
}

/* =========================
   Races: base/sub + size/speed
   ========================= */
function findRaceBase (races, name, source) {
	if (!name) return null;
	return races.find(r => r.name === name && r.source === source && !r.raceName)
		|| races.find(r => r.name === name && r.source === source)
		|| races.find(r => r.name === name);
}

function findSubrace (races, baseName, baseSource, subName, subSource) {
	if (!subName || !baseName) return null;
	return races.find(r =>
		r.name === subName
		&& r.source === subSource
		&& r.raceName === baseName
		&& (r.raceSource || baseSource) === baseSource
	) || races.find(r =>
		r.name === subName
		&& r.source === subSource
		&& r.raceName === baseName
	);
}

function fmtSize (size) {
	const code = Array.isArray(size) ? size[0] : size;
	if (!code) return "";
	try { if (Parser?.sizeAbvToFull) return Parser.sizeAbvToFull(code); } catch {}
	const map = {T:"Tiny", S:"Small", M:"Medium", L:"Large", H:"Huge", G:"Gargantuan"};
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
   Entries "lite renderer" (no Renderer)
   - strips {@...} tags
   - supports common entry types: string, entries, list, item, table, quote/inset
   ========================= */
function strip5eTags (s) {
	if (!s) return "";
	let out = String(s);

	// replace {@tag content|...} -> content (first segment)
	out = out.replace(/\{@([a-zA-Z]+)\s([^}]+)\}/g, (_, tag, body) => {
		const main = String(body).split("|")[0];
		// some tags: {@b text} {@i text}
		return main;
	});

	// remove remaining braces
	out = out.replace(/[{}]/g, "");
	return out;
}

function renderEntriesLite (entries, ctx) {
	if (entries == null) return "";
	if (typeof entries === "string") return `<div class="gpl-feat-p">${esc(strip5eTags(entries))}</div>`;

	if (Array.isArray(entries)) return entries.map(it => renderEntriesLite(it, ctx)).join("");

	if (typeof entries !== "object") return "";

	// deref common ref nodes
	if (entries.type === "refClassFeature" && entries.classFeature && ctx?.classFeatureMap) {
		const ref = ctx.classFeatureMap.get(String(entries.classFeature).toLowerCase());
		if (ref) return renderEntriesLite(ref.entries, ctx);
	}
	if (entries.type === "refSubclassFeature" && entries.subclassFeature && ctx?.subclassFeatureMap) {
		const ref = ctx.subclassFeatureMap.get(String(entries.subclassFeature).toLowerCase());
		if (ref) return renderEntriesLite(ref.entries, ctx);
	}

	if (entries.type === "entries") {
		const name = entries.name ? `<div class="gpl-feat-block-title">${esc(strip5eTags(entries.name))}</div>` : "";
		return `${name}${renderEntriesLite(entries.entries, ctx)}`;
	}

	if (entries.type === "list") {
		const items = (entries.items || []).map(it => {
			if (typeof it === "string") return `<li>${esc(strip5eTags(it))}</li>`;
			if (it?.type === "item") {
				const nm = it.name ? `<b>${esc(strip5eTags(it.name))}.</b> ` : "";
				const body = it.entry ? strip5eTags(it.entry) : "";
				const extra = it.entries ? renderEntriesLite(it.entries, ctx) : "";
				return `<li>${nm}${esc(body)}${extra ? `<div>${extra}</div>` : ""}</li>`;
			}
			return `<li>${renderEntriesLite(it, ctx)}</li>`;
		}).join("");
		return `<ul class="gpl-feat-ul">${items}</ul>`;
	}

	if (entries.type === "item") {
		const nm = entries.name ? `<div class="gpl-feat-block-title">${esc(strip5eTags(entries.name))}</div>` : "";
		const body = entries.entry ? `<div class="gpl-feat-p">${esc(strip5eTags(entries.entry))}</div>` : "";
		const extra = entries.entries ? renderEntriesLite(entries.entries, ctx) : "";
		return `${nm}${body}${extra}`;
	}

	if (entries.type === "table") {
		const caption = entries.caption ? `<div class="gpl-feat-block-title">${esc(strip5eTags(entries.caption))}</div>` : "";
		const colLabels = entries.colLabels || [];
		const rows = entries.rows || [];

		const head = colLabels.length
			? `<tr>${colLabels.map(c => `<th>${esc(strip5eTags(c))}</th>`).join("")}</tr>`
			: "";

		const bodyRows = rows.map(row => {
			const cells = (Array.isArray(row) ? row : [row]).map(c => `<td>${esc(strip5eTags(c))}</td>`).join("");
			return `<tr>${cells}</tr>`;
		}).join("");

		return `${caption}<table class="gpl-feat-table">${head}${bodyRows}</table>`;
	}

	if (entries.type === "quote" || entries.type === "inset") {
		return `<div class="gpl-feat-quote">${renderEntriesLite(entries.entries, ctx)}</div>`;
	}

	// fallback: try nested entries
	if (entries.entries) return renderEntriesLite(entries.entries, ctx);

	return "";
}

/* Build maps to deref refClassFeature/refSubclassFeature */
function buildFeatureRefMaps (classFile) {
	const classFeatureMap = new Map();
	const subclassFeatureMap = new Map();

	const cfs = Array.isArray(classFile?.classFeature) ? classFile.classFeature : [];
	const scfs = Array.isArray(classFile?.subclassFeature) ? classFile.subclassFeature : [];

	for (const f of cfs) {
		const key = `${f.name}|${f.className}|${f.classSource}|${f.level}${f.source ? `|${f.source}` : ""}`.toLowerCase();
		classFeatureMap.set(key, f);
	}

	for (const f of scfs) {
		const key = `${f.name}|${f.className}|${f.classSource}|${f.subclassShortName || f.subclassName || ""}|${f.subclassSource || ""}|${f.level}`.toLowerCase();
		subclassFeatureMap.set(key, f);
	}

	return { classFeatureMap, subclassFeatureMap };
}

/* subclass feature filter */
function isSubclassFeatureMatch (f, subclassEnt, scChoice) {
	if (!f || (!subclassEnt && !scChoice)) return false;

	const norm = s => String(s || "").trim().toLowerCase();
	const selName = norm(subclassEnt?.name ?? scChoice?.name);
	const selShort = norm(subclassEnt?.shortName ?? subclassEnt?.subclassShortName ?? scChoice?.name);
	const selSource = norm(subclassEnt?.source ?? scChoice?.source);

	const fShort = norm(f.subclassShortName);
	const fName = norm(f.subclassName);
	const fSource = norm(f.subclassSource);

	const srcOk = !f.subclassSource || !selSource || fSource === selSource;
	const nameOk = fName && fName === selName;
	const shortOk = fShort && (fShort === selShort || fShort === selName || selName.includes(fShort) || fShort.includes(selShort));

	return srcOk && (nameOk || shortOk);
}

function findSubclassEnt (classFile, clsChoice, scChoice) {
	if (!classFile?.subclass || !clsChoice || !scChoice) return null;
	return classFile.subclass.find(sc =>
		sc.name === scChoice.name
		&& sc.source === scChoice.source
		&& sc.className === clsChoice.name
	) || classFile.subclass.find(sc =>
		sc.name === scChoice.name
		&& sc.className === clsChoice.name
	);
}

/* =========================
   Print blocks
   ========================= */
function getParams () {
	const u = new URL(location.href);
	return {
		id: u.searchParams.get("id"),
		lvl: u.searchParams.get("lvl"),
		auto: u.searchParams.get("auto") === "1",
		features: u.searchParams.get("features") === "1",
	};
}

function nameTable (name) {
	return `
    <table class="tableBox">
      <tr class="tableValueBox"><td>${esc(name)}</td></tr>
      <tr><td class="label">Name</td></tr>
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
        <td class="label">Class &amp; Level</td>
        <td class="label">Background</td>
        <td class="label">Player Name</td>
      </tr>
    </table>

    <table class="tableBox">
      <tr class="tableValueBox">
        <td class="oneThird">${esc(meta.race)}</td>
        <td class="oneThird">${esc(meta.alignment)}</td>
        <td class="oneThird">${esc(meta.experience)}</td>
      </tr>
      <tr>
        <td class="label">Race</td>
        <td class="label">Alignment</td>
        <td class="label">Experience</td>
      </tr>
    </table>

    <table class="tableBox">
      <tr class="tableValueBox">
        <td>${esc(meta.size)}</td>
      </tr>
      <tr>
        <td class="label">Size</td>
      </tr>
    </table>
  `;
}

function combatStats (pb, dexMod, speed) {
	return `
    <div class="header">Combat Stats</div>
    <table class="tableBox">
      <tr class="tableValueBox">
        <td class="oneEight">+${pb}</td>
        <td class="oneEight"></td>
        <td class="oneEight">${fmtMod(dexMod)}</td>
        <td class="oneEight"></td>
        <td class="oneEight"></td>
        <td class="oneEight">${esc(speed || "")}</td>
        <td class="oneEight"></td>
      </tr>
      <tr>
        <td class="label">Prof. Bonus</td>
        <td class="label">Inspiration</td>
        <td class="label">Initiative</td>
        <td class="label">HD</td>
        <td class="label">HP</td>
        <td class="label">Spd</td>
        <td class="label">AC</td>
      </tr>
    </table>
  `;
}

function abilityAndSaves (ab, saveProfs, pb) {
	const mods = {};
	for (const k of ABILS) mods[k] = modFromScore(ab[k]);

	const saves = {};
	for (const k of ABILS) {
		const isProf = !!saveProfs?.[k];
		saves[k] = mods[k] + (isProf ? pb : 0);
	}

	const cells = ABILS.map(k => {
		const isProf = !!saveProfs?.[k];
		const x = isProf ? "X" : "o";
		const modTxt = fmtMod(mods[k]);
		const saveTxt = fmtMod(saves[k]);
		const scoreTxt = String(ab[k] ?? 10);
		const nameTxt = (ABIL_LABEL[k] || k).toUpperCase();

		return `
      <td class="gpl-abil-card">
        <div class="gpl-abil-card-inner">
          <div class="gpl-abil-save">${x}</div>
          <div class="gpl-abil-saveval">${esc(saveTxt)}</div>
          <div class="gpl-abil-mod">${esc(modTxt)}</div>
          <div class="gpl-abil-name">${esc(nameTxt)}</div>
          <div class="gpl-abil-score">${esc(scoreTxt)}</div>
        </div>
      </td>
    `;
	}).join("");

	return `
    <div class="header">ABILITY SCORES &amp; SAVING THROWS</div>
    <table class="gpl-abil-grid">
      <tr>${cells}</tr>
    </table>
  `;
}

function skillsBlock (ab, skillProfs, pb) {
	const mods = {};
	for (const k of ABILS) mods[k] = modFromScore(ab[k]);

	const groupsOrder = ["str", "dex", "con", "int", "wis", "cha"];
	const abilLabel = {str:"STR", dex:"DEX", con:"CON", int:"INT", wis:"WIS", cha:"CHA"};

	const groups = new Map(groupsOrder.map(k => [k, []]));
	for (const sk of SKILLS) if (groups.has(sk.abil)) groups.get(sk.abil).push(sk);
	for (const k of groupsOrder) groups.get(k).sort((a,b)=>a.name.localeCompare(b.name));

	let alt = false;

	const renderGroup = (abil) => {
		const arr = groups.get(abil) || [];
		if (!arr.length) return "";

		const rows = arr.map(sk => {
			const total = mods[sk.abil] + (skillProfs?.[sk.key] ? pb : 0);
			return `
        <tr>
          <td class="gpl-skill-col-chk">${chk(!!skillProfs?.[sk.key])}</td>
          <td class="gpl-skill-col-mod">${esc(fmtMod(total))}</td>
          <td>${esc(sk.name)}</td>
        </tr>
      `;
		}).join("");

		const table = `
      <table class="gpl-skill-group ${alt ? "gpl-skill-group--alt" : ""}">
        <tr class="gpl-skill-group-hdr">
          <td colspan="3">${esc(abilLabel[abil])} skills</td>
        </tr>
        ${rows}
      </table>
    `;

		alt = !alt;
		return table;
	};

	const blocks = groupsOrder.map(renderGroup).filter(Boolean);

	const passivePerception = 10 + mods.wis + (skillProfs?.perception ? pb : 0);
	blocks.push(`
    <table class="gpl-skill-group gpl-skill-passive">
      <tr class="gpl-skill-group-hdr">
        <td colspan="3">PASSIVE</td>
      </tr>
      <tr>
        <td class="gpl-skill-col-chk"></td>
        <td class="gpl-skill-col-mod">${esc(String(passivePerception))}</td>
        <td>Passive Perception (WIS)</td>
      </tr>
    </table>
  `);

	return blocks.join("");
}

function drawSkillsTriple (rec, lvl, pb) {
	const ab = rec.sheet?.abilities || {str:10,dex:10,con:10,int:10,wis:10,cha:10};
	const skillProfs = rec.sheet?.skillProfs || {};

	const profs = (rec.sheet?.profsText || "").trim().split("\n").filter(Boolean).join(" | ");
	const langs = (rec.sheet?.langText || "").trim().split("\n").filter(Boolean).join(" | ");
	const notes = (rec.sheet?.notes || "").trim();

	const choice = rec.state?.choice || {};
	const cls = choice.cls?.name ? `${choice.cls.name}` : "";
	const sub = choice.subclass?.name ? ` / ${choice.subclass.name}` : "";
	const race = choice.species?.name ? `${choice.species.name}` : "";
	const bg = choice.background?.name ? `${choice.background.name}` : "";
	const feats = (choice.feats || []).map(f => f?.name).filter(Boolean).join(", ");

	const midTop = `
    <tr><td><b>Class</b>: ${esc(`${cls}${sub} (lvl ${lvl})`)}</td></tr>
    <tr><td><b>Race</b>: ${esc(race || "—")}</td></tr>
    <tr><td><b>Background</b>: ${esc(bg || "—")}</td></tr>
    <tr><td><b>Feats</b>: ${esc(feats || "—")}</td></tr>
    <tr><td><b>Proficiencies</b>: ${esc(profs || "—")}</td></tr>
    <tr><td><b>Languages</b>: ${esc(langs || "—")}</td></tr>
    ${notes ? `<tr><td><b>Notes</b>: ${esc(notes)}</td></tr>` : ""}
  `;

	return `
    <table>
      <tr>
        <td><div class="header">Skills</div></td>
        <td style="width:100%" class="header">Proficiencies &amp; Basics</td>
        <td><div class="header">Current Stats</div></td>
      </tr>
      <tr>
        <td valign="top">${skillsBlock(ab, skillProfs, pb)}</td>
        <td valign="top"><table>${midTop}</table></td>
        <td valign="top">
          <table>
            <tr class="tableValueBox"><td></td></tr>
            <tr><td class="label">HP</td></tr>

            <tr class="tableValueBox"><td></td></tr>
            <tr><td class="label">AC</td></tr>

            <tr class="tableValueBox">
              <td>
                <table>
                  <tr><td class="small">Success:</td><td>&#9723;&#9723;&#9723;</td></tr>
                  <tr><td class="small">Failures:</td><td>&#9723;&#9723;&#9723;</td></tr>
                </table>
              </td>
            </tr>
            <tr><td class="label">Death Saves</td></tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/* Full features pages (entries) */
function renderFeatureSection (id, title, innerHtml) {
	return `
    <div class="gpl-feat-section" id="${esc(id)}">
      <div class="gpl-feat-title">${esc(title)}</div>
      ${innerHtml || `<div class="gpl-feat-p">(none)</div>`}
    </div>
  `;
}
function renderFeatureToc (items) {
	const fmt = (it) => {
		const n = Number(it.count ?? 0);
		const suffix = Number.isFinite(n) ? ` (${n})` : "";
		return `<li><a href="#${esc(it.id)}">${esc(it.title)}${esc(suffix)}</a></li>`;
	};

	return `
    <div class="gpl-feat-toc">
      <div class="gpl-feat-toc-title">Contents</div>
      <ul>
        ${items.map(fmt).join("")}
      </ul>
    </div>
  `;
}

function countNamedEntrySections (entries) {
	const set = new Set();

	const walk = (node, depth = 0) => {
		if (node == null || depth > 4) return;
		if (typeof node === "string") return;

		if (Array.isArray(node)) return node.forEach(n => walk(n, depth));

		if (typeof node === "object") {
			if (node.name && typeof node.name === "string") set.add(node.name);
			if (node.entries) walk(node.entries, depth + 1);
			if (node.items) walk(node.items, depth + 1);
			// tables/rows não têm "name" normalmente, mas deixa como está
		}
	};

	walk(entries, 0);
	return set.size;
}

function renderFeaturesPages (data) {
	const {race, subrace, bg, feats, classFeatures, subclassFeatures, ctx, lvl} = data;

	const wrapBlock = (html) => `<div class="gpl-feat-block">${html}</div>`;

	const raceHtml = race ? renderEntriesLite(race.entries, ctx) : "";
	const subraceHtml = subrace ? renderEntriesLite(subrace.entries, ctx) : "";
	const bgHtml = bg ? renderEntriesLite(bg.entries, ctx) : "";

	const featsHtml = (feats || []).map(ft => {
		const body = ft.entries ? renderEntriesLite(ft.entries, ctx) : "";
		return wrapBlock(
			`<div class="gpl-feat-block-title">Feat: ${esc(ft.name)} (${esc(ft.source || "")})</div>${body}`
		);
	}).join("");

	const classHtml = (classFeatures || []).map(f => {
		const body = f.entries ? renderEntriesLite(f.entries, ctx) : "";
		return wrapBlock(
			`<div class="gpl-feat-block-title">${esc(f.name)} (lvl ${esc(String(f.level))})</div>${body}`
		);
	}).join("");

	const subclassHtml = (subclassFeatures || []).map(f => {
		const body = f.entries ? renderEntriesLite(f.entries, ctx) : "";
		return wrapBlock(
			`<div class="gpl-feat-block-title">${esc(f.name)} (lvl ${esc(String(f.level))})</div>${body}`
		);
	}).join("");

	const raceCount = race?.entries ? countNamedEntrySections(race.entries) : 0;
	const subraceCount = subrace?.entries ? countNamedEntrySections(subrace.entries) : 0;
	const bgCount = bg?.entries ? countNamedEntrySections(bg.entries) : 0;

	const featsCount = (feats || []).length;
	const classCount = (classFeatures || []).length;
	const subclassCount = (subclassFeatures || []).length;

	// ✅ TOC items
	const tocItems = [
		{ id: "feat_race", title: "Race", count: raceCount },
		...(subrace ? [{ id: "feat_subrace", title: "Subrace", count: subraceCount }] : []),
		{ id: "feat_background", title: "Background", count: bgCount },
		{ id: "feat_feats", title: "Feats", count: featsCount },
		{ id: "feat_class", title: "Class", count: classCount },
		{ id: "feat_subclass", title: "Subclass", count: subclassCount },
	];

	const parts = [];

	// começa páginas de features numa nova página
	parts.push(`<div class="page-break"></div>`);
	parts.push(`<div class="gpl-feat-wrap gpl-feat-wrap--compact">`);
	parts.push(`<div class="header">FEATURES (UP TO LEVEL ${esc(String(lvl))})</div>`);

	// ✅ TOC no topo
	parts.push(renderFeatureToc(tocItems));

	// raça/subraça/background/feats
	parts.push(renderFeatureSection("feat_race", "Race", raceHtml));
	if (subrace) parts.push(renderFeatureSection("feat_subrace", "Subrace", subraceHtml));
	parts.push(renderFeatureSection("feat_background", "Background", bgHtml));
	parts.push(renderFeatureSection("feat_feats", "Feats", featsHtml));

	// ✅ quebra antes da classe
	parts.push(`<div class="page-break"></div>`);

	// classe/subclasse
	parts.push(renderFeatureSection("feat_class", "Class", classHtml));
	parts.push(renderFeatureSection("feat_subclass", "Subclass", subclassHtml));

	parts.push(`</div>`);
	return parts.join("");
}
/* =========================
   Main
   ========================= */
async function main () {
	const {id, lvl: lvlRaw, auto, features} = getParams();
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
	rec.sheet.abilities = rec.sheet.abilities || {str:10,dex:10,con:10,int:10,wis:10,cha:10};
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
	const subRace = (sp && sr) ? findSubrace(races, sp.name, sp.source, sr.name, sr.source) : null;

	const sizeStr = fmtSize(subRace?.size ?? baseRace?.size);
	const speedStr = fmtSpeed(subRace?.speed ?? baseRace?.speed);

	const dexMod = modFromScore(rec.sheet.abilities.dex);

	const classLevel = `${choice.cls?.name || "—"} ${lvl}${choice.subclass?.name ? ` (${choice.subclass.name})` : ""}`;
	const raceStr = `${choice.species?.name || "—"}${choice.subrace?.name ? ` (${choice.subrace.name})` : ""}`;
	const bgStr = choice.background?.name || "—";

	const htmlParts = [];

	htmlParts.push(`<div class="center title">Character Sheet</div>`);
	htmlParts.push(nameTable(rec.name || rec.state?.meta?.name || "Unnamed"));
	htmlParts.push(introBlock({
		classLevel,
		background: bgStr,
		playerName: "",
		race: raceStr,
		alignment: "",
		experience: "",
		size: sizeStr,
	}));
	htmlParts.push(combatStats(pb, dexMod, speedStr));
	htmlParts.push(abilityAndSaves(rec.sheet.abilities, rec.sheet.saveProfs, pb));
	htmlParts.push(drawSkillsTriple(rec, lvl, pb));

	// FULL FEATURES (entries), grouped
	if (features) {
		// background & feats entities
		const bgs = await pLoadBackgrounds();
		const featsAll = await pLoadFeats();

		const bgEnt = choice.background
			? (bgs.find(b => b.name === choice.background.name && b.source === choice.background.source) || bgs.find(b => b.name === choice.background.name))
			: null;

		const featEnts = (Array.isArray(choice.feats) ? choice.feats : [])
			.map(f => featsAll.find(x => x.name === f.name && x.source === f.source) || featsAll.find(x => x.name === f.name))
			.filter(Boolean);

		// class/subclass features
		let classFeatures = [];
		let subclassFeatures = [];
		let ctx = {};

		if (choice.cls?.name) {
			const classFile = await pLoadClassFileByName(choice.cls.name);
			if (classFile) {
				const maps = buildFeatureRefMaps(classFile);
				ctx = { ...maps };

				const cfs = Array.isArray(classFile.classFeature) ? classFile.classFeature : [];
				classFeatures = cfs
					.filter(f => f.className === choice.cls.name)
					.filter(f => !choice.cls.source || f.classSource === choice.cls.source)
					.filter(f => Number(f.level) <= lvl)
					.sort((a,b)=> (a.level - b.level) || a.name.localeCompare(b.name));

				const scfs = Array.isArray(classFile.subclassFeature) ? classFile.subclassFeature : [];
				const subclassEnt = findSubclassEnt(classFile, choice.cls, choice.subclass);

				subclassFeatures = scfs
					.filter(f => f.className === choice.cls.name)
					.filter(f => !choice.cls.source || f.classSource === choice.cls.source)
					.filter(f => Number(f.level) <= lvl)
					.filter(f => isSubclassFeatureMatch(f, subclassEnt, choice.subclass))
					.sort((a,b)=> (a.level - b.level) || a.name.localeCompare(b.name));
			}
		}

		htmlParts.push(renderFeaturesPages({
			race: baseRace,
			subrace: subRace,
			bg: bgEnt,
			feats: featEnts,
			classFeatures,
			subclassFeatures,
			ctx,
			lvl,
		}));
	}

	document.getElementById("gpl_sheet").innerHTML = htmlParts.join("\n");

	if (auto) setTimeout(() => window.print(), 50);
}

main();
