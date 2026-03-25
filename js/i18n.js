/* i18n overlay loader (PT-BR)
 *
 * Loads translation overlays from data/i18n/<lang>/index.json.
 * Overlays are additive: if no translation exists, fallback to original English data.
 *
 * This file is imported as an ES module by pages like charsheet/print.
 */
"use strict";

export class I18n {
	static _isInit = false;
	static _lang = "ptbr";

	// ===== Core entity overlays =====
	static _mapRace = new Map();            // keyRace -> {namePt, entries, sizeEntry}
	static _mapBackground = new Map();      // keyNameSource -> {namePt, entries}
	static _mapFeat = new Map();            // keyNameSource -> {namePt, entries}
	static _mapSubclassFeature = new Map(); // keySubclassFeature -> {namePt, entries}

	// ===== Fluff overlays =====
	static _mapRaceFluff = new Map();        // keyNameSource -> {entries}
	static _mapBackgroundFluff = new Map();  // keyNameSource -> {entries}
	static _mapFeatFluff = new Map();        // keyNameSource -> {entries}

	// ===== Existing overlays (class features + fluff) =====
	static _mapClassFeature = new Map();  // keyClassFeature -> {namePt, entries}
	static _mapClassFluff = new Map();    // keyNameSource -> {entries}
	static _mapSubclassFluff = new Map(); // keySubclassFluff -> {entries}

	// =========================
	// Key helpers
	// =========================
	static _keyNameSource (name, source) {
		return `${name ?? ""}|${source ?? ""}`.toLowerCase();
	}

	static _keyRace (r) {
		// In 5etools, subraces often live inside `race` and have `raceName`/`raceSource`.
		const name = r?.name ?? "";
		const source = r?.source ?? "";
		const raceName = r?.raceName ?? "";
		const raceSource = r?.raceSource ?? "";
		return `${name}|${source}|${raceName}|${raceSource}`.toLowerCase();
	}

	static _keyClassFeature (cf) {
		const name = cf?.name ?? "";
		const className = cf?.className ?? "";
		const classSource = cf?.classSource ?? "";
		const level = cf?.level ?? "";
		const source = cf?.source ?? "";
		return `${name}|${className}|${classSource}|${level}|${source}`.toLowerCase();
	}

	static _keySubclassFeature (sf) {
		// Mirrors the identifying fields used by 5etools for subclass features.
		const name = sf?.name ?? "";
		const className = sf?.className ?? "";
		const classSource = sf?.classSource ?? "";
		const subclassShortName = sf?.subclassShortName ?? "";
		const subclassSource = sf?.subclassSource ?? "";
		const level = sf?.level ?? "";
		const source = sf?.source ?? "";
		return `${name}|${className}|${classSource}|${subclassShortName}|${subclassSource}|${level}|${source}`.toLowerCase();
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

	// =========================
	// Init + ingest
	// =========================
	static async pInit ({ lang = "ptbr" } = {}) {
		if (this._isInit) return;
		this._isInit = true;
		this._lang = (lang || "ptbr").toLowerCase();

		let idx = null;
		try {
			idx = await fetch(`data/i18n/${this._lang}/index.json`).then(r => r.json());
		} catch (e) {
			console.warn(`[i18n] No index found at data/i18n/${this._lang}/index.json`, e);
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
		// ===== races (includes subraces-in-race array) =====
		if (Array.isArray(data?.race)) {
			for (const r of data.race) {
				this._mapRace.set(this._keyRace(r), {
					namePt: r?.namePt ?? null,
					entries: r?.entries ?? null,
					sizeEntry: r?.sizeEntry ?? null,
				});
			}
		}

		// ===== backgrounds =====
		if (Array.isArray(data?.background)) {
			for (const bg of data.background) {
				this._mapBackground.set(this._keyNameSource(bg?.name, bg?.source), {
					namePt: bg?.namePt ?? null,
					entries: bg?.entries ?? null,
				});
			}
		}

		// ===== feats =====
		if (Array.isArray(data?.feat)) {
			for (const ft of data.feat) {
				this._mapFeat.set(this._keyNameSource(ft?.name, ft?.source), {
					namePt: ft?.namePt ?? null,
					entries: ft?.entries ?? null,
				});
			}
		}

		// ===== subclass features =====
		if (Array.isArray(data?.subclassFeature)) {
			for (const sf of data.subclassFeature) {
				this._mapSubclassFeature.set(this._keySubclassFeature(sf), {
					namePt: sf?.namePt ?? null,
					entries: sf?.entries ?? null,
				});
			}
		}

		// ===== class features =====
		if (Array.isArray(data?.classFeature)) {
			for (const cf of data.classFeature) {
				this._mapClassFeature.set(this._keyClassFeature(cf), {
					namePt: cf?.namePt ?? null,
					entries: cf?.entries ?? null,
				});
			}
		}

		// ===== fluff =====
		if (Array.isArray(data?.raceFluff)) {
			for (const fl of data.raceFluff) {
				this._mapRaceFluff.set(this._keyNameSource(fl?.name, fl?.source), { entries: fl?.entries ?? null });
			}
		}
		if (Array.isArray(data?.backgroundFluff)) {
			for (const fl of data.backgroundFluff) {
				this._mapBackgroundFluff.set(this._keyNameSource(fl?.name, fl?.source), { entries: fl?.entries ?? null });
			}
		}
		if (Array.isArray(data?.featFluff)) {
			for (const fl of data.featFluff) {
				this._mapFeatFluff.set(this._keyNameSource(fl?.name, fl?.source), { entries: fl?.entries ?? null });
			}
		}
		if (Array.isArray(data?.classFluff)) {
			for (const fl of data.classFluff) {
				this._mapClassFluff.set(this._keyNameSource(fl?.name, fl?.source), { entries: fl?.entries ?? null });
			}
		}
		if (Array.isArray(data?.subclassFluff)) {
			for (const scf of data.subclassFluff) {
				this._mapSubclassFluff.set(this._keySubclassFluff(scf), { entries: scf?.entries ?? null });
			}
		}
	}

	// =========================
	// Getters — races
	// =========================
	static getRaceOverlay (r) { return this._mapRace.get(this._keyRace(r)) || null; }
	static getRaceName (r) { return this.getRaceOverlay(r)?.namePt || null; }
	static getRaceEntries (r) { return this.getRaceOverlay(r)?.entries || null; }
	static getRaceSizeEntry (r) { return this.getRaceOverlay(r)?.sizeEntry || null; }

	static getRaceFluffEntries ({ name, source }) {
		return this._mapRaceFluff.get(this._keyNameSource(name, source))?.entries || null;
	}

	// =========================
	// Getters — backgrounds
	// =========================
	static getBackgroundOverlay (bg) { return this._mapBackground.get(this._keyNameSource(bg?.name, bg?.source)) || null; }
	static getBackgroundName (bg) { return this.getBackgroundOverlay(bg)?.namePt || null; }
	static getBackgroundEntries (bg) { return this.getBackgroundOverlay(bg)?.entries || null; }
	static getBackgroundFluffEntries ({ name, source }) {
		return this._mapBackgroundFluff.get(this._keyNameSource(name, source))?.entries || null;
	}

	// =========================
	// Getters — feats
	// =========================
	static getFeatOverlay (ft) { return this._mapFeat.get(this._keyNameSource(ft?.name, ft?.source)) || null; }
	static getFeatName (ft) { return this.getFeatOverlay(ft)?.namePt || null; }
	static getFeatEntries (ft) { return this.getFeatOverlay(ft)?.entries || null; }
	static getFeatFluffEntries ({ name, source }) {
		return this._mapFeatFluff.get(this._keyNameSource(name, source))?.entries || null;
	}

	// =========================
	// Getters — subclass features
	// =========================
	static getSubclassFeatureOverlay (sf) { return this._mapSubclassFeature.get(this._keySubclassFeature(sf)) || null; }
	static getSubclassFeatureName (sf) { return this.getSubclassFeatureOverlay(sf)?.namePt || null; }
	static getSubclassFeatureEntries (sf) { return this.getSubclassFeatureOverlay(sf)?.entries || null; }

	// =========================
	// Getters — class features + fluff (existing)
	// =========================
	static getClassFeatureOverlay (cf) { return this._mapClassFeature.get(this._keyClassFeature(cf)) || null; }
	static getClassFeatureName (cf) { return this.getClassFeatureOverlay(cf)?.namePt || null; }
	static getClassFeatureEntries (cf) { return this.getClassFeatureOverlay(cf)?.entries || null; }

	static getClassFluffEntries ({ name, source }) {
		return this._mapClassFluff.get(this._keyNameSource(name, source))?.entries || null;
	}
	static getSubclassFluffEntries (scf) {
		return this._mapSubclassFluff.get(this._keySubclassFluff(scf))?.entries || null;
	}
}
