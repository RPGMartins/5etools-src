/* global localforage */
"use strict";

const DB_NAME = "rpgmartins_5etools";
const DB_STORE = "characters_v1";

function getBuilderStorageKey () {
	const keys = Object.keys(localStorage).filter(k => k.startsWith("rpgmartins_cb_active_v"));
	if (!keys.length) return "rpgmartins_cb_active_v11";
	keys.sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
	return keys[keys.length - 1];
}

function escapeHtml (str) {
	return String(str ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function fmtDateTime (ts) {
	if (!ts) return "—";
	try { return new Date(ts).toLocaleString(); } catch { return "—"; }
}

function getChoiceStr (obj) {
	if (!obj?.name) return "—";
	if (!obj.source) return obj.name;
	return `${obj.name} (${obj.source})`;
}

function getSummaryChips (state) {
	const ch = state?.choice || {};
	const meta = state?.meta || {};
	const species = ch.species ? getChoiceStr(ch.species) : null;
	const subrace = ch.subrace ? getChoiceStr(ch.subrace) : null;
	const cls = ch.cls ? getChoiceStr(ch.cls) : null;
	const subclass = ch.subclass ? getChoiceStr(ch.subclass) : null;
	const bg = ch.background ? getChoiceStr(ch.background) : null;
	const feats = Array.isArray(ch.feats) ? ch.feats.map(getChoiceStr) : [];
	return {
		isSrdOnly: !!meta.isSrdOnly,
		species: species ? (subrace ? `${species} — ${subrace}` : species) : null,
		cls: cls ? (subclass ? `${cls} — ${subclass}` : cls) : null,
		background: bg,
		feats,
	};
}

function toast (msg, type = "info") {
	if (window.JqueryUtil?.doToast) return window.JqueryUtil.doToast({content: msg, type});
	alert(msg);
}

class CharManageApp {
	constructor () {
		this._db = localforage.createInstance({ name: DB_NAME, storeName: DB_STORE });

		this._els = {
			search: document.getElementById("cm__search"),
			btnNew: document.getElementById("cm__btn_new"),
			btnRefresh: document.getElementById("cm__btn_refresh"),
			list: document.getElementById("cm__list"),
			empty: document.getElementById("cm__empty"),
			count: document.getElementById("cm__count"),
			btnImportFile: document.getElementById("cm__btn_import_file"),
			btnImportClipboard: document.getElementById("cm__btn_import_clipboard"),
			iptImportFile: document.getElementById("cm__ipt_import_file"),
		};

		this._all = [];
		this._filtered = [];
	}

	async pInit () {
		this._bind();
		await this._pLoad();
		this._render();
	}

	_bind () {
		this._els.search.addEventListener("input", () => {
			this._applyFilter();
			this._render();
		});

		this._els.btnRefresh.addEventListener("click", async () => {
			await this._pLoad();
			this._render();
			toast("Atualizado.", "success");
		});

		this._els.btnNew.addEventListener("click", () => {
			localStorage.removeItem(getBuilderStorageKey());
			window.location.href = "charbuilder.html";
		});

		this._els.list.addEventListener("click", async (evt) => {
			const btn = evt.target.closest("[data-act]");
			if (!btn) return;

			const act = btn.dataset.act;
			const id = btn.dataset.id;
			const rec = this._all.find(it => it.id === id);
			if (!rec) return;

			if (act === "edit") return this._doEdit(rec);
			if (act === "delete") return this._doDelete(rec);
			if (act === "export") return this._doExport(rec);
			if (act === "copyjson") return this._doCopyJson(rec);
			if (act === "sheet") return (window.location.href = `charsheet.html?id=${encodeURIComponent(rec.id)}`);
		});

		this._els.btnImportFile?.addEventListener("click", () => this._els.iptImportFile?.click());

		this._els.iptImportFile?.addEventListener("change", async () => {
			const f = this._els.iptImportFile.files?.[0];
			// reseta o input pra permitir importar o mesmo arquivo de novo
			this._els.iptImportFile.value = "";
			if (!f) return;
			await this._pImportFromFile(f);
		});

		this._els.btnImportClipboard?.addEventListener("click", async () => {
			await this._pImportFromClipboard();
		});
	}

	async _pLoad () {
		const out = [];
		await this._db.iterate((value, key) => {
			if (!value) return;
			const id = value.id || key;
			out.push({
				id,
				name: value.name || value?.state?.meta?.name || "Unnamed",
				createdAt: value.createdAt,
				updatedAt: value.updatedAt || value.createdAt,
				state: value.state || null,
			});
		});

		out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
		this._all = out;
		this._applyFilter();
	}

	_applyFilter () {
		const q = (this._els.search.value || "").trim().toLowerCase();
		this._filtered = !q ? [...this._all] : this._all.filter(it => (it.name || "").toLowerCase().includes(q));
	}

	_render () {
		this._els.list.innerHTML = "";
		this._els.count.textContent = `${this._filtered.length} character(s)`;
		this._els.empty.classList.toggle("ve-hidden", this._filtered.length !== 0);

		for (const rec of this._filtered) {
			const sum = getSummaryChips(rec.state);
			const featsText = sum.feats.length ? sum.feats.join(", ") : "—";

			const html = `
				<div class="cm__card">
					<div class="cm__card-hdr">
						<div>
							<div class="cm__name">${escapeHtml(rec.name)}</div>
							<div class="cm__dates">
								<b>Updated:</b> ${escapeHtml(fmtDateTime(rec.updatedAt))} &nbsp;•&nbsp;
								<b>Created:</b> ${escapeHtml(fmtDateTime(rec.createdAt))}
							</div>
						</div>

						<div class="cm__actions">
							<button class="ve-btn ve-btn-default ve-btn-xs" data-act="sheet" data-id="${escapeHtml(rec.id)}">Ficha</button>
							<button class="ve-btn ve-btn-default ve-btn-xs" data-act="edit" data-id="${escapeHtml(rec.id)}">Edit</button>
							<button class="ve-btn ve-btn-danger ve-btn-xs" data-act="delete" data-id="${escapeHtml(rec.id)}">Delete</button>
						</div>
					</div>

					<div class="cm__chips">
						<span class="cm__chip"><b>SRD-only</b> ${sum.isSrdOnly ? "ON" : "OFF"}</span>
						<span class="cm__chip"><b>Species</b> ${escapeHtml(sum.species || "—")}</span>
						<span class="cm__chip"><b>Class</b> ${escapeHtml(sum.cls || "—")}</span>
						<span class="cm__chip"><b>Background</b> ${escapeHtml(sum.background || "—")}</span>
						<span class="cm__chip"><b>Feats</b> ${escapeHtml(String(sum.feats.length))}</span>
					</div>

					<details class="cm__details">
						<summary>Details</summary>

						<div class="cm__btn-row">
							<button class="ve-btn ve-btn-default ve-btn-xs" data-act="export" data-id="${escapeHtml(rec.id)}">Export JSON</button>
							<button class="ve-btn ve-btn-default ve-btn-xs" data-act="copyjson" data-id="${escapeHtml(rec.id)}">Copy JSON</button>
						</div>

						<div class="ve-muted ve-mt-1 ve-small">
							<b>Feats:</b> ${escapeHtml(featsText)}
						</div>

						<pre class="cm__pre">${escapeHtml(JSON.stringify(rec, null, 2))}</pre>
					</details>
				</div>
			`;

			const wrap = document.createElement("div");
			wrap.innerHTML = html;
			this._els.list.appendChild(wrap.firstElementChild);
		}
	}

	_doEdit (rec) {
		if (!rec?.state) return toast("Esse personagem não tem state salvo.", "danger");

		const key = getBuilderStorageKey();

		rec.state.meta = rec.state.meta || {};
		rec.state.meta.name = rec.name || rec.state.meta.name || "";
		rec.state.meta.editId = rec.id; // ✅ isso habilita o Update no builder

		localStorage.setItem(key, JSON.stringify(rec.state));
		window.location.href = "charbuilder.html";
	}

	async _doDelete (rec) {
		const ok = confirm(`Deletar "${rec.name}"? Isso não tem como desfazer.`);
		if (!ok) return;

		await this._db.removeItem(rec.id);
		await this._pLoad();
		this._render();
		toast("Deletado.", "success");
	}

	_doExport (rec) {
		const blob = new Blob([JSON.stringify(rec, null, 2)], { type: "application/json" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `${(rec.name || "character").replace(/[^\w\-]+/g, "_")}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(a.href);
	}

	async _doCopyJson (rec) {
		try {
			await navigator.clipboard.writeText(JSON.stringify(rec, null, 2));
			toast("JSON copiado.", "success");
		} catch {
			toast("Não consegui acessar o clipboard (permissão do navegador).", "warning");
		}
	}

	_newId () {
		// Preferir UUID nativo
		if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
		// Fallback simples
		return `ch_${Date.now()}_${Math.random().toString(16).slice(2)}`;
	}

	async _pImportFromFile (file) {
		try {
			const text = await file.text();
			await this._pImportFromText(text);
		} catch (e) {
			console.error(e);
			alert("Falha ao ler o arquivo.");
		}
	}

	async _pImportFromClipboard () {
		try {
			// Clipboard API exige HTTPS ou localhost
			const text = await navigator.clipboard.readText();
			if (!text?.trim()) return alert("Clipboard vazio.");
			await this._pImportFromText(text);
		} catch (e) {
			console.error(e);
			alert("Não consegui ler o clipboard. Dica: isso funciona em HTTPS ou localhost e pode precisar de permissão.");
		}
	}

	async _pImportFromText (text) {
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (e) {
			console.error(e);
			alert("O conteúdo não é um JSON válido.");
			return;
		}

		// Aceita: 1 personagem, ou lista
		const chars = Array.isArray(parsed)
			? parsed
			: Array.isArray(parsed?.characters)
				? parsed.characters
				: [parsed];

		let importedCount = 0;

		for (const raw of chars) {
			const rec = this._normalizeImportedCharacter(raw);
			if (!rec) continue;

			await this._db.setItem(rec.id, rec);
			importedCount++;
		}

		if (!importedCount) {
			alert("Não encontrei nenhum personagem válido para importar.");
			return;
		}

		// Recarrega lista
		await this._pLoad();
		this._render();

		alert(`Importado${importedCount > 1 ? "s" : ""}: ${importedCount}`);
	}

	_normalizeImportedCharacter (raw) {
		if (!raw || typeof raw !== "object") return null;

		// Formatos aceitos:
		// A) formato do seu DB: {id, name, state, sheet, createdAt, updatedAt}
		// B) export “solto”: {name, state, sheet}
		// C) export do builder: {state, sheet} ou {meta,...}
		// D) o usuário colou só o "state" -> {choice:{...}, meta:{...}} (a gente envolve)

		const now = Date.now();
		const id = this._newId();

		// Se veio só "state" (parece ter "choice" e/ou "meta"), embrulha
		const looksLikeStateOnly = raw.choice || raw.meta;
		const state = raw.state || (looksLikeStateOnly ? raw : null);

		if (!state || typeof state !== "object") return null;

		const sheet = raw.sheet && typeof raw.sheet === "object"
			? raw.sheet
			: {}; // opcional, pode vir vazio

		const name =
			raw.name
			|| raw?.state?.meta?.name
			|| raw?.meta?.name
			|| "Personagem importado";

		// Limpa qualquer “editId” que possa apontar pra algo antigo
		if (state?.meta) {
			state.meta = { ...state.meta };
			delete state.meta.editId;
		}

		// Normaliza: garante objetos principais existirem
		const safeState = {
			meta: state.meta || {},
			choice: state.choice || {},
			...state,
		};

		const safeSheet = {
			level: Number(sheet.level) || 1,
			abilities: sheet.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
			saveProfs: sheet.saveProfs || {},
			skillProfs: sheet.skillProfs || {},
			profsText: sheet.profsText ?? "",
			langText: sheet.langText ?? "",
			notes: sheet.notes ?? "",
			ui: sheet.ui || {},
		};

		return {
			id,
			name,
			state: safeState,
			sheet: safeSheet,
			createdAt: now,
			updatedAt: now,
		};
	}
}

window.addEventListener("load", async () => {
	const app = new CharManageApp();
	await app.pInit();
	window.dbg_cm = app;
});
