/* i18n overlay loader (PT-BR)
   - Loads translation overlays from data/i18n/ptbr/
   - Designed to be additive: if no translation exists, fallback to original English data.
*/
"use strict";

export class I18n {
	static _isInit = false;
	static _lang = "ptbr";

	static _mapClassFeature = new Map();    // key -> {namePt, entries}
	static _mapSubclassFeature = new Map(); // (reserved)
	static _mapClassFluff = new Map();      // key -> {entries}
	static _mapSubclassFluff = new Map();   // key -> {entries}

	static _keyClassFeature (cf) {
		const name = cf?.name ?? "";
		const className = cf?.className ?? "";
		const classSource = cf?.classSource ?? "";
		const level = cf?.level ?? "";
		const source = cf?.source ?? "";
		return `${name}|${className}|${classSource}|${level}|${source}`.toLowerCase();
	}

	static _keyClassFluff (name, source) {
		return `${name ?? ""}|${source ?? ""}`.toLowerCase();
	}

	static _keySubclassFluff (scf) {
		// Most fluff uses: name+shortName+source+className+classSource
		const name = scf?.name ?? "";
		const shortName = scf?.shortName ?? "";
		const source = scf?.source ?? "";
		const className = scf?.className ?? "";
		const classSource = scf?.classSource ?? "";
		return `${name}|${shortName}|${source}|${className}|${classSource}`.toLowerCase();
	}

	static async pInit ({ lang = "ptbr" } = {}) {
		if (this._isInit) return;
		this._isInit = true;
		this._lang = lang;

		// Load index
		let idx = null;
		try {
			idx = await fetch(`data/i18n/${lang}/index.json`).then(r => r.json());
		} catch (e) {
			console.warn(`[i18n] No index found at data/i18n/${lang}/index.json`, e);
			return;
		}

		const files = Array.isArray(idx?.files) ? idx.files : [];
		for (const path of files) {
			try {
				const data = await fetch(path).then(r => r.json());
				this._ingest(data);
			} catch (e) {
				console.warn(`[i18n] Failed to load overlay file: ${path}`, e);
			}
		}
	}

	static _ingest (data) {
		// classFeature overlays
		if (Array.isArray(data?.classFeature)) {
			for (const cf of data.classFeature) {
				const key = this._keyClassFeature(cf);
				this._mapClassFeature.set(key, {
					namePt: cf?.namePt ?? null,
					entries: cf?.entries ?? null,
				});
			}
		}

		// class fluff overlays
		if (Array.isArray(data?.classFluff)) {
			for (const fl of data.classFluff) {
				const key = this._keyClassFluff(fl?.name, fl?.source);
				this._mapClassFluff.set(key, { entries: fl?.entries ?? null });
			}
		}

		// subclass fluff overlays
		if (Array.isArray(data?.subclassFluff)) {
			for (const scf of data.subclassFluff) {
				const key = this._keySubclassFluff(scf);
				this._mapSubclassFluff.set(key, { entries: scf?.entries ?? null });
			}
		}
	}

	static getClassFeatureOverlay (cf) {
		return this._mapClassFeature.get(this._keyClassFeature(cf)) || null;
	}

	static getClassFeatureName (cf) {
		return this.getClassFeatureOverlay(cf)?.namePt || null;
	}

	static getClassFeatureEntries (cf) {
		return this.getClassFeatureOverlay(cf)?.entries || null;
	}

	static getClassFluffEntries ({ name, source }) {
		return this._mapClassFluff.get(this._keyClassFluff(name, source))?.entries || null;
	}

	static getSubclassFluffEntries (scf) {
		return this._mapSubclassFluff.get(this._keySubclassFluff(scf))?.entries || null;
	}
}
