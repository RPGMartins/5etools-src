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
}

window.addEventListener("load", async () => {
	const app = new CharManageApp();
	await app.pInit();
	window.dbg_cm = app;
});
