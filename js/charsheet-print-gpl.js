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
   Races: Size/Speed helpers
   ========================= */
let __RACES_CACHE = null;

async function pLoadRaces () {
	if (__RACES_CACHE) return __RACES_CACHE;

	const json = await fetch("data/races.json").then(r => r.json());
	__RACES_CACHE = Array.isArray(json.race) ? json.race : [];
	return __RACES_CACHE;
}

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
	try {
		if (typeof Parser !== "undefined" && Parser.sizeAbvToFull) return Parser.sizeAbvToFull(code);
	} catch {}
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

function getParams () {
	const u = new URL(location.href);
	return {
		id: u.searchParams.get("id"),
		lvl: u.searchParams.get("lvl"),
		auto: u.searchParams.get("auto") === "1",
	};
}

/* =========================
   Blocks
   ========================= */
function nameTable (name) {
	return `
		<table class="tableBox">
			<tr class="tableValueBox"><td>${esc(name)}</td></tr>
			<tr><td class="label">Name</td></tr>
		</table>
	`;
}

function introBlock (meta) {
	// ✅ Languages removido do cabeçalho
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

function featuresLines (rec, lvl) {
	const choice = rec.state?.choice || {};
	const cls = choice.cls?.name ? `${choice.cls.name}` : "";
	const sub = choice.subclass?.name ? ` / ${choice.subclass.name}` : "";
	const race = choice.species?.name ? `${choice.species.name}` : "";
	const bg = choice.background?.name ? `${choice.background.name}` : "";

	const profs = (rec.sheet?.profsText || "").trim().split("\n").filter(Boolean);
	const langs = (rec.sheet?.langText || "").trim().split("\n").filter(Boolean);

	const feats = (choice.feats || []).map(f => f?.name).filter(Boolean);

	const lines = [];
	if (cls || sub) lines.push({label:"Class", description:`${cls}${sub} (lvl ${lvl})`});
	if (race) lines.push({label:"Race", description: race});
	if (bg) lines.push({label:"Background", description: bg});
	if (feats.length) lines.push({label:"Feats", description: feats.join(", ")});
	if (profs.length) lines.push({label:"Proficiencies", description: profs.join(" | ")});
	if (langs.length) lines.push({label:"Languages", description: langs.join(" | ")});
	if ((rec.sheet?.notes || "").trim()) lines.push({label:"Notes", description: rec.sheet.notes.trim()});

	return lines;
}

function drawSkillsTriple (rec, lvl, pb) {
	const ab = rec.sheet?.abilities || {str:10,dex:10,con:10,int:10,wis:10,cha:10};
	const skillProfs = rec.sheet?.skillProfs || {};

	const mid = featuresLines(rec, lvl)
		.map(it => `<tr><td><b>${esc(it.label)}</b>: ${esc(it.description)}</td></tr>`)
		.join("");

	// ✅ Current Stats: remove HD e Experience (fica HP/AC + Death Saves)
	return `
		<table>
			<tr>
				<td><div class="header">Skills</div></td>
				<td style="width:100%" class="header">Proficiencies, Abilities &amp; Features</td>
				<td><div class="header">Current Stats</div></td>
			</tr>
			<tr>
				<td valign="top">${skillsBlock(ab, skillProfs, pb)}</td>
				<td valign="top"><table>${mid || "<tr><td></td></tr>"}</table></td>
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

async function main () {
	const {id, lvl: lvlRaw, auto} = getParams();
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

	// ✅ lvl primeiro
	const lvl = Number(lvlRaw) || Number(rec.sheet.level) || 1;
	const pb = profBonusFromLevel(lvl);

	// ✅ choice UMA vez, antes de usar
	const choice = rec.state?.choice || {};

	// ✅ size/speed da raça/subraça
	let sizeStr = "";
	let speedStr = "";
	try {
		const races = await pLoadRaces();
		const sp = choice.species; // {name, source}
		const sr = choice.subrace; // {name, source}

		const baseRace = sp ? findRaceBase(races, sp.name, sp.source) : null;
		const subRace = (sp && sr) ? findSubrace(races, sp.name, sp.source, sr.name, sr.source) : null;

		sizeStr = fmtSize(subRace?.size ?? baseRace?.size);
		speedStr = fmtSpeed(subRace?.speed ?? baseRace?.speed);
	} catch {
		// fallback: vazio
	}

	const dexMod = modFromScore(rec.sheet.abilities.dex);

	const classLevel = `${choice.cls?.name || "—"} ${lvl}${choice.subclass?.name ? ` (${choice.subclass.name})` : ""}`;
	const raceStr = `${choice.species?.name || "—"}${choice.subrace?.name ? ` (${choice.subrace.name})` : ""}`;
	const bgStr = choice.background?.name || "—";

	const html = [
		`<div class="center title">Character Sheet</div>`,
		nameTable(rec.name || rec.state?.meta?.name || "Unnamed"),
		introBlock({
			classLevel,
			background: bgStr,
			playerName: "",
			race: raceStr,
			alignment: "",
			experience: "",
			size: sizeStr,
		}),
		combatStats(pb, dexMod, speedStr),
		abilityAndSaves(rec.sheet.abilities, rec.sheet.saveProfs, pb),
		drawSkillsTriple(rec, lvl, pb),
	].join("\n");

	document.getElementById("gpl_sheet").innerHTML = html;

	if (auto) setTimeout(() => window.print(), 50);
}

main();
