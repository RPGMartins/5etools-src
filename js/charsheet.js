/* global localforage, Parser, Renderer, BrewUtil2, PrereleaseUtil */
"use strict";

const DB_NAME = "rpgmartins_5etools";
const DB_STORE = "characters_v1";
const LS_LAST_CHAR = "rpgmartins_cs_lastCharId";

const ABILS = ["str", "dex", "con", "int", "wis", "cha"];
const ABIL_LABEL = {str:"STR", dex:"DEX", con:"CON", int:"INT", wis:"WIS", cha:"CHA"};

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
	.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");

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

// Deref helpers for refClassFeature/refSubclassFeature inside entries
function uidParseLevel (parts) {
	for (let i = parts.length - 1; i >= 0; i--) {
		const n = Number(parts[i]);
		if (Number.isFinite(n)) return n;
	}
	return null;
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

			taProfs: document.getElementById("cs__ta_profs"),
			taLang: document.getElementById("cs__ta_lang"),
			taNotes: document.getElementById("cs__ta_notes"),

			features: document.getElementById("cs__features"),
		};

		this._chars = [];
		this._rec = null;         // record atual
		this._rules = null;       // dados carregados (class/subclass/features)
		this._ui = { printFull: false };

		this._pSaveDebounced = debounce(() => this._pSaveRec(), 300);
	}

	async pInit () {
		await Promise.allSettled([
			PrereleaseUtil?.pInit?.(),
			BrewUtil2?.pInit?.(),
		]);

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

		this._els.btnManager.addEventListener("click", () => {
			location.href = "charmanage.html";
		});

		this._els.btnPrint.addEventListener("click", () => window.print());

		this._els.btnPrintFull.addEventListener("click", async () => {
			if (!this._rec) return;
			const old = { lvl: this._rec.sheet.level };

			this._ui.printFull = true;
			document.body.classList.add("cs--print-full");

			// renderiza como lvl 20 só para o print
			this._renderFeatures({forceLevel: 20, forceOpenAll: true});

			const onAfter = () => {
				window.removeEventListener("afterprint", onAfter);
				this._ui.printFull = false;
				document.body.classList.remove("cs--print-full");
				this._renderFeatures(); // volta ao normal
			};

			window.addEventListener("afterprint", onAfter);
			window.print();

			// fallback (caso afterprint não dispare em alguns browsers)
			setTimeout(() => {
				if (this._ui.printFull) {
					this._ui.printFull = false;
					document.body.classList.remove("cs--print-full");
					this._renderFeatures();
				}
			}, 1500);

			// não alteramos o level salvo
			this._rec.sheet.level = old.lvl;
		});
	}

	async _pLoadCharList () {
		const out = [];
		await this._db.iterate((value, key) => {
			if (!value) return;
			out.push({
				id: value.id || key,
				name: value.name || value?.state?.meta?.name || "Unnamed",
				updatedAt: value.updatedAt || value.createdAt || 0,
			});
		});
		out.sort((a, b) => (b.updatedAt - a.updatedAt) || a.name.localeCompare(b.name));
		this._chars = out;

		this._els.selChar.innerHTML = out.length
			? out.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")
			: `<option value="">(no characters saved)</option>`;
	}

	async _pLoadCharacter (id) {
		const rec = await this._db.getItem(id);
		if (!rec) return;

		localStorage.setItem(LS_LAST_CHAR, id);

		// sheet state “editável” separado do builder
		rec.sheet = rec.sheet || this._getDefaultSheet();
		rec.sheet.level = Number(rec.sheet.level) || 1;
		rec.sheet.abilities = rec.sheet.abilities || this._getDefaultSheet().abilities;
		rec.sheet.saveProfs = rec.sheet.saveProfs || {};
		rec.sheet.skillProfs = rec.sheet.skillProfs || {};
		rec.sheet.profsText = rec.sheet.profsText ?? "";
		rec.sheet.langText = rec.sheet.langText ?? "";
		rec.sheet.notes = rec.sheet.notes ?? "";

		this._rec = rec;

		// carrega dados de regras pro personagem (class/subclass/features)
		this._rules = await this._pLoadRulesForRec(rec);

		// tenta auto-preencher saving throws se vier da class JSON (opcional)
		this._maybeAutoFillSaveProfs();

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

		// salva caso tenhamos preenchido defaults
		await this._pSaveRec();
	}

	_getDefaultSheet () {
		return {
			level: 1,
			abilities: {str:10, dex:10, con:10, int:10, wis:10, cha:10},
			saveProfs: {},     // {str:true,...}
			skillProfs: {},    // {acrobatics:true,...}
			profsText: "",
			langText: "",
			notes: "",
		};
	}

	_renderEmpty () {
		this._els.name.textContent = "—";
		this._els.sub.textContent = "No character saved yet.";
		this._els.meta.textContent = "";
		this._els.metaRhs.textContent = "";
		this._els.abilities.innerHTML = "";
		this._els.saves.innerHTML = "";
		this._els.skills.innerHTML = "";
		this._els.features.innerHTML = `<div class="initial-message initial-message--med">Create a character first.</div>`;
	}

	_renderHeader () {
		const rec = this._rec;
		const ch = rec?.state?.choice || {};

		const sp = ch.species ? `${ch.species.name} (${ch.species.source})` : "—";
		const sr = ch.subrace ? ` — ${ch.subrace.name} (${ch.subrace.source})` : "";
		const cls = ch.cls ? `${ch.cls.name} (${ch.cls.source})` : "—";
		const sc = ch.subclass ? ` — ${ch.subclass.name} (${ch.subclass.source})` : "";
		const bg = ch.background ? `${ch.background.name} (${ch.background.source})` : "—";

		this._els.name.textContent = rec.name || rec?.state?.meta?.name || "Unnamed";
		this._els.sub.textContent = `${cls}${sc} • ${sp}${sr} • ${bg}`;

		this._els.meta.textContent = `ID: ${rec.id}`;
		this._els.metaRhs.textContent = `Saved locally • Updated: ${new Date(rec.updatedAt || rec.createdAt || Date.now()).toLocaleString()}`;
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
						<span class="cs__row-meta">score</span>
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

				// atualiza mod e tudo derivado
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
						<span class="cs__row-meta">${esc(fmtMod(mod))}</span>
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
				this._renderSaves();
			});
		});
	}

	_renderSkills () {
		const lvl = this._rec.sheet.level || 1;
		const pb = profBonusFromLevel(lvl);
		const ab = this._rec.sheet.abilities;
		const sp = this._rec.sheet.skillProfs || {};

		this._els.skills.innerHTML = SKILLS.map(sk => {
			const mod = modFromScore(ab[sk.abil]);
			const isProf = !!sp[sk.key];
			const total = mod + (isProf ? pb : 0);

			return `
				<div class="cs__row">
					<label style="display:flex; align-items:center; gap:8px; margin:0;">
						<input type="checkbox" data-skill="${esc(sk.key)}" ${isProf ? "checked" : ""}>
						<span class="cs__row-name">${esc(sk.name)}</span>
						<span class="cs__row-meta">(${esc(ABIL_LABEL[sk.abil])} ${esc(fmtMod(mod))})</span>
					</label>
					<div class="cs__row-val">${esc(fmtMod(total))}</div>
				</div>
			`;
		}).join("");

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

	async _pLoadRulesForRec (rec) {
		const choice = rec?.state?.choice || {};
		const clsChoice = choice.cls;
		const scChoice = choice.subclass;

		// 1) tenta achar class/subclass no brew/prerelease, se existirem
		const brew = await this._pGetBrewMerged();
		const clsFromBrew = clsChoice ? (brew.class || []).find(c => c.name === clsChoice.name && c.source === clsChoice.source) : null;
		const scFromBrew = scChoice ? (brew.subclass || []).find(s => s.name === scChoice.name && s.source === scChoice.source && s.className === clsChoice?.name) : null;

		// 2) carrega arquivo padrão do 5etools pelo nome da classe (index.json)
		let fileJson = null;
		if (clsChoice && !clsFromBrew) {
			fileJson = await this._pLoadClassFileByName(clsChoice.name);
		}

		const classEnt =
			clsFromBrew
			|| (fileJson?.class || []).find(c => c.name === clsChoice?.name && c.source === clsChoice?.source)
			|| (fileJson?.class || []).find(c => c.name === clsChoice?.name);

		const subclassEnt =
			scFromBrew
			|| (fileJson?.subclass || []).find(s => s.name === scChoice?.name && s.source === scChoice?.source && s.className === clsChoice?.name && s.classSource === clsChoice?.source)
			|| (fileJson?.subclass || []).find(s => s.name === scChoice?.name && s.className === clsChoice?.name);

		// features: filtra direto pelos objetos classFeature/subclassFeature do arquivo
		const classFeatures = [
			...(fileJson?.classFeature || []),
			...(brew.classFeature || []),
		].filter(f => f.className === clsChoice?.name && f.classSource === clsChoice?.source);

		const subclassFeatures = [
			...(fileJson?.subclassFeature || []),
			...(brew.subclassFeature || []),
		].filter(f => f.className === clsChoice?.name && f.classSource === clsChoice?.source);

		// index por UID “string”
		const mapCf = new Map();
		const mapScf = new Map();

		for (const f of classFeatures) {
			// uid típico: "Name|Class|Source|Level|Source"
			const uid = `${f.name}|${f.className}|${f.classSource}|${f.level}${f.source ? `|${f.source}` : ""}`;
			mapCf.set(uid, f);
		}

		for (const f of subclassFeatures) {
			// uid típico: "Name|Class|ClassSource|SubclassShort|SubclassSource|Level"
			const uid = `${f.name}|${f.className}|${f.classSource}|${f.subclassShortName || f.subclassName || ""}|${f.subclassSource || ""}|${f.level}`;
			mapScf.set(uid, f);
		}

		return { classEnt, subclassEnt, classFeatures, subclassFeatures, mapCf, mapScf };
	}

	async _pGetBrewMerged () {
		// une prerelease + brew
		const out = { class: [], subclass: [], classFeature: [], subclassFeature: [] };

		try {
			if (PrereleaseUtil?.pGetBrewProcessed) {
				const pre = await PrereleaseUtil.pGetBrewProcessed();
				(out.class ||= []).push(...(pre?.class || []));
				(out.subclass ||= []).push(...(pre?.subclass || []));
				(out.classFeature ||= []).push(...(pre?.classFeature || []));
				(out.subclassFeature ||= []).push(...(pre?.subclassFeature || []));
			}
		} catch {}

		try {
			if (BrewUtil2?.pGetBrewProcessed) {
				const br = await BrewUtil2.pGetBrewProcessed();
				(out.class ||= []).push(...(br?.class || []));
				(out.subclass ||= []).push(...(br?.subclass || []));
				(out.classFeature ||= []).push(...(br?.classFeature || []));
				(out.subclassFeature ||= []).push(...(br?.subclassFeature || []));
			}
		} catch {}

		return out;
	}

	async _pLoadClassFileByName (className) {
		const idx = await fetch("data/class/index.json").then(r => r.json());
		const key = String(className || "").toLowerCase();
		const fn = idx[key];
		if (!fn) return null;
		return fetch(`data/class/${fn}`).then(r => r.json());
	}

	_maybeAutoFillSaveProfs () {
		// se o usuário já mexeu, não sobrescreve
		const hasAny = Object.values(this._rec.sheet.saveProfs || {}).some(Boolean);
		if (hasAny) return;

		const profArr = this._rules?.classEnt?.proficiency; // wiki diz que existe em algumas classes :contentReference[oaicite:4]{index=4}
		if (!Array.isArray(profArr) || !profArr.length) return;

		const set = {};
		for (const ab of profArr) {
			const k = String(ab || "").slice(0, 3).toLowerCase();
			if (ABILS.includes(k)) set[k] = true;
		}
		this._rec.sheet.saveProfs = set;
	}

	_derefEntries (entries) {
		// resolve refClassFeature/refSubclassFeature “na raça” (sem depender de internals)
		const walk = (node) => {
			if (node == null) return node;
			if (typeof node === "string") return node;
			if (Array.isArray(node)) return node.map(walk);

			if (node.type === "refClassFeature" && node.classFeature) {
				const cf = this._findClassFeatureFromRef(node.classFeature);
				if (!cf) return { type: "entries", name: "(Feature)", entries: ["(Missing refClassFeature.)"] };
				return { type: "entries", name: cf.name, entries: walk(cf.entries || []) };
			}

			if (node.type === "refSubclassFeature" && node.subclassFeature) {
				const scf = this._findSubclassFeatureFromRef(node.subclassFeature);
				if (!scf) return { type: "entries", name: "(Feature)", entries: ["(Missing refSubclassFeature.)"] };
				return { type: "entries", name: scf.name, entries: walk(scf.entries || []) };
			}

			const out = {...node};
			for (const k of Object.keys(out)) out[k] = walk(out[k]);
			return out;
		};

		return walk(entries);
	}

	_findClassFeatureFromRef (refStr) {
		// ex: "Replicate Magic Item|Artificer|EFA|2|EFA"
		const parts = String(refStr).split("|").map(s => s.trim());
		const name = parts[0];
		const className = parts[1];
		const classSource = parts[2];
		const lvl = uidParseLevel(parts);

		const list = this._rules?.classFeatures || [];
		return list.find(f => f.name === name && f.className === className && f.classSource === classSource && (lvl == null || f.level === lvl))
			|| list.find(f => f.name === name && f.className === className && f.classSource === classSource);
	}

	_findSubclassFeatureFromRef (refStr) {
		// ex: "Guardian|Artificer|TCE|Armorer|TCE|15"
		const parts = String(refStr).split("|").map(s => s.trim());
		const name = parts[0];
		const className = parts[1];
		const classSource = parts[2];
		const subShort = parts[3];
		const subSource = parts[4];
		const lvl = uidParseLevel(parts);

		const list = this._rules?.subclassFeatures || [];
		return list.find(f =>
			f.name === name
			&& f.className === className
			&& f.classSource === classSource
			&& (f.subclassShortName === subShort || f.subclassName === subShort)
			&& (f.subclassSource === subSource)
			&& (lvl == null || f.level === lvl)
		) || list.find(f =>
			f.name === name
			&& f.className === className
			&& f.classSource === classSource
			&& (f.subclassShortName === subShort || f.subclassName === subShort)
		);
	}

	_renderFeatures (opts = {}) {
		if (!this._rules) {
			this._els.features.innerHTML = `<div class="initial-message initial-message--med">No class data.</div>`;
			return;
		}

		const lvl = opts.forceLevel ?? (this._rec.sheet.level || 1);
		const openAll = !!opts.forceOpenAll;

		const r = Renderer.get();

		const classEnt = this._rules.classEnt;
		const subclassEnt = this._rules.subclassEnt;

		const cf = (this._rules.classFeatures || [])
			.filter(f => Number(f.level) <= lvl)
			.sort((a,b) => (a.level - b.level) || a.name.localeCompare(b.name));

		const scf = (this._rules.subclassFeatures || [])
			.filter(f => !!subclassEnt && (f.subclassShortName === subclassEnt.shortName || f.subclassShortName === subclassEnt.subclassShortName || f.subclassName === subclassEnt.name))
			.filter(f => Number(f.level) <= lvl)
			.sort((a,b) => (a.level - b.level) || a.name.localeCompare(b.name));

		const blocks = [];

		if (classEnt) blocks.push(`<div class="cs__hint"><b>Class:</b> ${esc(classEnt.name)} (${esc(classEnt.source)}) • Showing up to level ${esc(String(lvl))}</div>`);
		if (subclassEnt) blocks.push(`<div class="cs__hint"><b>Subclass:</b> ${esc(subclassEnt.name)} (${esc(subclassEnt.source)})</div>`);

		const renderFeat = (f) => {
			const entries = this._derefEntries(f.entries || []);
			const inner = entries?.length ? r.render({type:"entries", entries}) : `<div class="cs__hint">(No entries)</div>`;

			return `
				<details class="cs__feature" ${openAll ? "open" : ""}>
					<summary>${esc(f.name)} <span class="cs__feat-meta">• lvl ${esc(String(f.level))}</span></summary>
					<div class="ve-mt-2">${inner}</div>
				</details>
			`;
		};

		if (cf.length) {
			blocks.push(`<div class="ve-h4 ve-mt-2">Class Features</div>`);
			blocks.push(cf.map(renderFeat).join(""));
		}

		if (subclassEnt) {
			blocks.push(`<div class="ve-h4 ve-mt-2">Subclass Features</div>`);
			blocks.push(scf.length ? scf.map(renderFeat).join("") : `<div class="cs__hint">(No subclass features found for this selection.)</div>`);
		}

		if (!cf.length && !scf.length) {
			blocks.push(`<div class="initial-message initial-message--med">No features to show (missing class selection or data).</div>`);
		}

		this._els.features.innerHTML = blocks.join("");
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
			sheet: this._rec.sheet, // ✅ novo bloco
		});

		// Atualiza RHS timestamp
		this._els.metaRhs.textContent = `Saved locally • Updated: ${new Date(this._rec.updatedAt).toLocaleString()}`;
	}
}

window.addEventListener("load", async () => {
	const app = new SheetApp();
	await app.pInit();
	window.dbg_sheet = app;
});
