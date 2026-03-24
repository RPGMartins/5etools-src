/* GPL note:
   This file builds a print sheet using a layout inspired by dungeontiger/d_d_characterSheets_5e (GPL-3.0).
*/
"use strict";

/* global localforage */

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

function getParams () {
	const u = new URL(location.href);
	return {
		id: u.searchParams.get("id"),
		lvl: u.searchParams.get("lvl"),
		auto: u.searchParams.get("auto") === "1",
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
        <td>${esc(meta.languages)}</td>
      </tr>
      <tr>
        <td class="label">Size</td>
        <td class="label">Languages</td>
      </tr>
    </table>
  `;
}

function combatStats (pb, dexMod) {
	return `
    <div class="header">Combat Stats</div>
    <table class="tableBox">
      <tr class="tableValueBox">
        <td class="oneEight">+${pb}</td>
        <td class="oneEight"></td>
        <td class="oneEight">${fmtMod(dexMod)}</td>
        <td class="oneEight"></td>
        <td class="oneEight"></td>
        <td class="oneEight"></td>
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

	const save = {};
	for (const k of ABILS) save[k] = mods[k] + (saveProfs?.[k] ? pb : 0);

	return `
    <table class="tableBox">
      <tr>
        <td colspan="6"><div class="header">Ability Scores</div></td>
        <td colspan="6"><div class="header">Saving Throws</div></td>
      </tr>

      <tr class="tableValueBox">
        ${ABILS.map(k => `<td class="one12th">${esc(String(ab[k] ?? 10))} (${esc(fmtMod(mods[k]))})</td>`).join("")}
        ${ABILS.map(k => `<td class="one12th">${esc(fmtMod(save[k]))}</td>`).join("")}
      </tr>

      <tr>
        ${ABILS.map(k => `<td class="label">${esc(ABIL_LABEL[k])}</td>`).join("")}
        ${ABILS.map(k => `<td class="label"><div class="inline smallWidth">${chk(!!saveProfs?.[k])}</div> ${esc(ABIL_LABEL[k])}</td>`).join("")}
      </tr>
    </table>
  `;
}

function skillsBlock (ab, skillProfs, pb) {
	const mods = {};
	for (const k of ABILS) mods[k] = modFromScore(ab[k]);

	const rows = SKILLS.map(sk => {
		const total = mods[sk.abil] + (skillProfs?.[sk.key] ? pb : 0);
		return `<tr>
      <td>${chk(!!skillProfs?.[sk.key])}</td>
      <td>${esc(fmtMod(total))}</td>
      <td class="small">${esc(sk.name)} (${esc(sk.abil)})</td>
    </tr>`;
	}).join("");

	const passivePerception = 10 + mods.wis + (skillProfs?.perception ? pb : 0);

	return `
    <table class="tableBox">
      ${rows}
      <tr><td></td><td>${esc(String(passivePerception))}</td><td class="small">Passive Perception (wis)</td></tr>
    </table>
  `;
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
            <tr><td class="label">HD</td></tr>
            <tr class="tableValueBox"><td></td></tr>
            <tr><td class="label">Experience</td></tr>
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

	const lvl = Number(lvlRaw) || Number(rec.sheet.level) || 1;
	const pb = profBonusFromLevel(lvl);

	const dexMod = modFromScore(rec.sheet.abilities.dex);

	const choice = rec.state?.choice || {};
	const classLevel = `${choice.cls?.name || "—"} ${lvl}${choice.subclass?.name ? ` (${choice.subclass.name})` : ""}`;
	const raceStr = `${choice.species?.name || "—"}${choice.subrace?.name ? ` (${choice.subrace.name})` : ""}`;
	const bgStr = choice.background?.name || "—";

	// languages: tenta pegar só a parte “Race: common, draconic”
	const langText = (rec.sheet.langText || "").split("\n").map(s => s.trim()).filter(Boolean);
	const langs = langText.length ? langText.join(" | ") : "";

	const html = [
		`<div class="center title">Character Sheet</div>`,
		nameTable(rec.name || rec.state?.meta?.name || "Unnamed"),
		introBlock({
			classLevel,
			background: bgStr,
			playerName: "",       // opcional
			race: raceStr,
			alignment: "",        // opcional
			experience: "",       // opcional
			size: "",             // opcional
			languages: langs,
		}),
		combatStats(pb, dexMod),
		abilityAndSaves(rec.sheet.abilities, rec.sheet.saveProfs, pb),
		drawSkillsTriple(rec, lvl, pb),
	].join("\n");

	document.getElementById("gpl_sheet").innerHTML = html;

	if (auto) {
		setTimeout(() => window.print(), 50);
	}
}

main();
