import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";
import { setImmediate as setImmediate$1 } from "node:timers/promises";
//#region server/guard.ts
function sameOrigin(origin, host) {
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}
function sameOriginJson(req) {
	const ct = String(req.headers?.["content-type"] ?? "");
	const origin = req.headers?.origin;
	return /^application\/json\s*(;|$)/i.test(ct) && !(origin && !sameOrigin(String(origin), req.headers?.host));
}
var loopbackHosts = (port) => [
	`127.0.0.1:${port}`,
	`localhost:${port}`,
	`[::1]:${port}`
];
function hostGuard(getPort) {
	return (req, res, next) => {
		const port = getPort();
		if (!port || !loopbackHosts(port).includes(String(req.headers.host ?? "").toLowerCase())) {
			res.statusCode = 403;
			res.end("Forbidden");
			return;
		}
		next();
	};
}
//#endregion
//#region server/intentMeta.ts
function frontMatter(md) {
	const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const out = {};
	if (!m) return out;
	for (const line of m[1].split(/\r?\n/)) {
		const i = line.indexOf(":");
		if (i > 0 && !line.startsWith(" ")) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
	}
	return out;
}
var unquote = (s) => s.replace(/^["']|["']$/g, "");
/** Người/lúc tạo plan từ front-matter plan.md (R-132); thiếu hoặc rỗng → không có trường. */
function planOrigin(fm) {
	const createdBy = unquote(fm.tao_boi ?? "").trim();
	const createdAt = unquote(fm.tao_luc ?? "").trim();
	const separator = createdBy.indexOf(" · ");
	const createdUser = separator >= 0 ? createdBy.slice(0, separator).trim() : "";
	const createdAgent = separator >= 0 ? createdBy.slice(separator + 3).trim() : "";
	return {
		...createdBy && { createdBy },
		...createdAt && { createdAt },
		...createdUser && { createdUser },
		...createdAgent && { createdAgent }
	};
}
function missionTitle(fm, md, folder) {
	return unquote((fm.tieu_de || fm.title || md.match(/^#\s+(.+)$/m)?.[1] || folder).trim());
}
var RISKS = [
	"LOW",
	"MEDIUM",
	"HIGH",
	"CRITICAL"
];
function parseRisk(fm) {
	const v = unquote(fm.muc_rui_ro ?? "").toUpperCase();
	return RISKS.includes(v) ? v : null;
}
function parseFinalState(fm) {
	if (fm.trang_thai === void 0) return {
		state: null,
		warning: null
	};
	const val = unquote(fm.trang_thai.trim()).trim();
	if (!val) return {
		state: null,
		warning: "Khóa trang_thai rỗng"
	};
	if (val === "done" || val === "archived") return {
		state: val,
		warning: null
	};
	return {
		state: null,
		warning: `Giá trị trang_thai không hợp lệ: "${val}"`
	};
}
var BUDGET_BY_RISK = {
	LOW: 2e5,
	MEDIUM: 5e5,
	HIGH: 1e6,
	CRITICAL: 1e6
};
var BUDGET_DEFAULT = 5e5;
/** Ngưỡng token chưa cache cho mỗi task: `ngan_sach_token` > mức rủi ro > mặc định. */
function taskBudget(fm, risk) {
	const n = Number(unquote(fm.ngan_sach_token ?? "").replace(/[_\s,]/g, ""));
	if (Number.isInteger(n) && n > 0) return n;
	return risk ? BUDGET_BY_RISK[risk] : BUDGET_DEFAULT;
}
function artifactChecklist(files, risk) {
	const high = risk === "HIGH" || risk === "CRITICAL";
	const isRollback = (f) => /^rollback/i.test(f);
	const hasSql = files.some((f) => f.toLowerCase().endsWith(".sql") && !isRollback(f));
	const own = (n) => files.includes(n) ? n : null;
	const rb = files.filter(isRollback);
	const rollback = rb.find((f) => /^rollback[^/]*\.sql$/i.test(f)) ?? rb.find((f) => f.startsWith("rollback/")) ?? rb[0] ?? null;
	return [
		{
			name: "intent.md",
			present: files.includes("intent.md"),
			required: true,
			file: own("intent.md")
		},
		{
			name: "research.md",
			present: files.includes("research.md"),
			required: false,
			file: own("research.md")
		},
		{
			name: "spec.md",
			present: files.includes("spec.md"),
			required: false,
			file: own("spec.md")
		},
		{
			name: "plan.md",
			present: files.includes("plan.md"),
			required: high,
			file: own("plan.md")
		},
		{
			name: "progress.md",
			present: files.includes("progress.md"),
			required: false,
			file: own("progress.md")
		},
		{
			name: "decision.md",
			present: files.includes("decision.md"),
			required: false,
			file: own("decision.md")
		},
		{
			name: "review.md",
			present: files.includes("review.md"),
			required: false,
			file: own("review.md")
		},
		{
			name: "rollback",
			present: rb.length > 0,
			required: high || hasSql,
			file: rollback
		}
	];
}
//#endregion
//#region shared/roles.ts
function declaredAgentName(name) {
	const trimmed = name.trim();
	return trimmed.split(/[(·]/, 1)[0].trim() || trimmed;
}
function splitDeclaredAgents(who) {
	const names = [];
	let depth = 0;
	let part = "";
	for (const char of who ?? "") {
		if (char === "(") depth++;
		else if (char === ")" && depth > 0) depth--;
		if (depth === 0 && ",+&/".includes(char)) {
			if (part.trim()) names.push(part.trim());
			part = "";
		} else part += char;
	}
	if (part.trim()) names.push(part.trim());
	return names;
}
function classifyRole(agentName) {
	if (!agentName) return "agent";
	const raw = agentName.trim().toLowerCase();
	if (raw.includes("research") || raw.includes("explore") || raw.includes("investigat")) return "researcher";
	if (raw.includes("review")) return "reviewer";
	if (raw.includes("verif") || raw.includes("test")) return "verifier";
	if (raw.includes("fix")) return "quick-fix";
	if (raw.includes("backend") || raw.includes("dotnet") || raw.includes(".net") || /(?:^|[-_\s])be(?:[-_\s]|$)/.test(raw) || raw.startsWith("be-") || raw.endsWith("-be")) return "be-dev";
	if (raw.includes("frontend") || raw.includes("ui-") || raw.includes("-ui") || /(?:^|[-_\s])(fe|ui)(?:[-_\s]|$)/.test(raw) || raw.startsWith("fe-") || raw.endsWith("-fe")) return "fe-dev";
	return "agent";
}
//#endregion
//#region server/redact.ts
var MAX = 4e3;
var cut$1 = (s) => s.length > MAX ? `${s.slice(0, MAX)}…` : s;
var normPath = (p) => p.replace(/\\/g, "/");
var maskDigits = (s) => s.replace(/\d(?:[\s.-]?\d){8,}/g, "•••");
var LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g;
function maskSecrets(s) {
	return s.replace(/(^|\s)-p\S+/g, "$1-p•••").replace(/(\bmysql(?:dump|admin)?\b[^|;&\n]*?\s-p\s+)\S+/g, "$1•••").replace(/(--(?:password|passwd|token|secret|api-key)[\s=])\S+/g, "$1•••").replace(/(-u\s*[^\s:]+:)\S+/g, "$1•••").replace(/((?:password|passwd|pwd|pass|secret|token|api[_-]?key)\s*[=:]\s*)\S+/gi, "$1•••").replace(/(Bearer\s+)\S+/g, "$1•••").replace(/(Authorization:\s*)\S+(?:\s+\S+)?/g, "$1•••").replace(/\b([A-Z0-9_]*(?:PASS|PWD|SECRET|TOKEN|KEY)[A-Z0-9_]*=)\S+/g, "$1•••");
}
var maskText = (s) => maskDigits(maskSecrets(s));
var SECRET_KEY = /pass|pwd|secret|token|api[_-]?key|authorization|credential/i;
function maskJson(v, key = "") {
	if (typeof v === "string") return SECRET_KEY.test(key) ? "•••" : maskText(v);
	if (Array.isArray(v)) return v.map((x) => maskJson(x, key));
	if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskJson(x, k)]));
	return v;
}
var maskedJson = (o) => JSON.stringify(maskJson(o));
function maskSql(sql) {
	return sql.replace(LITERAL, "'•••'").replace(/\b\d{6,}\b/g, "•••");
}
var FILE_TOOLS = [
	"Read",
	"Write",
	"Edit",
	"NotebookEdit",
	"write_to_file",
	"replace_file_content",
	"view_file"
];
function describeInput(tool, input) {
	const str = (k) => typeof input[k] === "string" ? input[k] : "";
	if (FILE_TOOLS.includes(tool)) {
		const p = normPath(str("file_path") || str("notebook_path") || str("TargetFile") || str("AbsolutePath"));
		return {
			target: p,
			input: p
		};
	}
	if (tool === "Bash" || tool === "PowerShell" || tool === "run_command") {
		const raw = str("command") || str("CommandLine");
		const h = raw.indexOf("<<");
		const cmd = maskText((h < 0 ? raw : `${raw.slice(0, h)} <<…`).replace(LITERAL, "'•••'"));
		return {
			target: cmd.split("\n")[0].slice(0, 80),
			input: cut$1(cmd)
		};
	}
	if (tool === "Agent") return {
		target: str("subagent_type") || "general-purpose",
		input: cut$1(maskText(`${str("description")}\n\n${str("prompt")}`))
	};
	if (tool === "Skill") return {
		target: str("skill"),
		input: cut$1(maskText(str("args")))
	};
	const sql = str("sql") || str("query");
	if (sql && /sql/i.test(tool)) return {
		target: tool.split("__")[1] ?? tool,
		input: cut$1(maskSql(sql))
	};
	if (tool === "Grep" || tool === "Glob") return {
		target: maskDigits(str("pattern")),
		input: cut$1(maskedJson(input))
	};
	return {
		target: tool,
		input: cut$1(maskedJson(input))
	};
}
var WHY_MAX = 280;
function maskWhy(s) {
	const t = maskText(s.replace(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g, "•••").replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "•••").replace(LITERAL, "'•••'").replace(/`[^`]*`/g, "`•••`")).replace(/\s+/g, " ").trim();
	return t.length > WHY_MAX ? `${t.slice(0, WHY_MAX)}…` : t;
}
//#endregion
//#region ../../packages/agents-private/claude/hooks/plan-table.mjs
/** @typedef {'TODO'|'DOING'|'CHỜ-USER'|'BLOCKED'|'DONE'|'SKIP'|'?'} TaskStatus */
/** @typedef {{ id: string, title: string, deps: string[], status: TaskStatus, note: string, sha: string | null, who: string, files: string[] }} PlanTask */
/** @typedef {{ tasks: PlanTask[], warnings: string[], cols: { id: number, status: number } | null, idHeader: string, headerLine: number, firstTableLine: number }} ParsedPlan */
var HEADERS = {
	id: ["id", "#"],
	title: ["task"],
	deps: ["phụ thuộc", "deps"],
	status: ["trạng thái", "status"],
	who: [
		"ai làm",
		"ai",
		"agent"
	],
	files: ["file đụng"]
};
var REQUIRED = [
	"id",
	"title",
	"deps",
	"status"
];
var R132_FROM = "2026-10-03";
/** Chỉ kiểm dạng, không kiểm giá trị ngày hợp lệ; nhận cả `Z` và giây. */
var TAO_LUC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;
var FRESH_MS = 6e4;
var PLAN_PATH = /(?:^|[\\/])docs[\\/]artifact[\\/]([^\\/]+)[\\/](?:plan|progress)\.md$/i;
/** @param {string} line */
function splitRow(line) {
	const t = line.trim();
	const parts = t.split(/(?<!\\)\|/);
	if (t.startsWith("|")) parts.shift();
	if (t.endsWith("|")) parts.pop();
	return parts.map((c) => c.trim());
}
/** @param {string} s */
var clean = (s) => s.replace(/[*`]/g, "").trim();
/** @param {string} s */
var norm$1 = (s) => clean(s).toLowerCase().normalize("NFC");
/** @param {string[]} cells @returns {Record<string, number> | null} */
function mapHeader(cells) {
	/** @type {Record<string, number>} */
	const map = {};
	cells.forEach((c, i) => {
		const h = norm$1(c);
		for (const [key, names] of Object.entries(HEADERS)) if (names.includes(h) && !(key in map)) map[key] = i;
	});
	return REQUIRED.every((k) => k in map) ? map : null;
}
/** @param {string} cell @returns {{ status: TaskStatus, note: string, sha: string | null }} */
function parseStatus$1(cell) {
	const s = cell.normalize("NFC").replace(/\*\*/g, "").trim();
	const sha = s.match(/`([0-9a-f]{7,40})`/)?.[1] ?? null;
	const m = s.match(/^\[?\s*(TODO|DOING|CHỜ-USER|CHO-USER|BLOCKED|DONE|SKIP)\b\s*\]?/i);
	if (!m) return {
		status: "?",
		note: s,
		sha
	};
	const kw = m[1].toUpperCase();
	return {
		status: kw === "CHO-USER" ? "CHỜ-USER" : kw,
		note: s.slice(m[0].length).replace(/^\s*[—–-]\s*/, "").trim(),
		sha
	};
}
/** @param {string} cell @returns {string[]} */
function parseDeps(cell) {
	const c = clean(cell);
	if (c === "" || c === "—" || c === "-") return [];
	return c.split(/[,\s·]+/).filter(Boolean);
}
/** @param {string[]} lines @param {number} i */
var isTableHead = (lines, i) => lines[i].trim().startsWith("|") && /^\s*\|?\s*:?-+:?\s*\|/.test(lines[i + 1] ?? "");
/** Dòng nằm trong khối ``` (mẫu bảng / heading trong fence không phải thật). @param {string[]} lines */
function fenceMask(lines) {
	let fence = false;
	return lines.map((l) => {
		if (/^\s*```/.test(l)) {
			fence = !fence;
			return true;
		}
		return fence;
	});
}
/** Mục riêng của task: `### Task <số>: …` hoặc `### <ID>: …` (R-132). @param {string[]} heads @param {string} id */
function hasSection(heads, id) {
	const num = id.match(/^T?(\d+)$/i)?.[1];
	const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const sep = "(?:\\s*[:.—–-]|\\s|$)";
	const re = new RegExp(`^#{2,4}\\s+(?:(?:Task\\s+)?${esc}${sep}${num ? `|Task\\s+${num}${sep}` : ""})`, "i");
	return heads.some((h) => re.test(h));
}
/** @param {string} md @returns {ParsedPlan} */
function parsePlan$1(md) {
	const lines = md.split(/\r?\n/);
	const inFence = fenceMask(lines);
	let firstTableLine = -1;
	for (let i = 0; i + 1 < lines.length; i++) {
		if (inFence[i] || !isTableHead(lines, i)) continue;
		if (firstTableLine < 0) firstTableLine = i;
		const cells = splitRow(lines[i]);
		const map = mapHeader(cells);
		if (!map) continue;
		/** @type {PlanTask[]} */
		const tasks = [];
		/** @type {string[]} */
		const warnings = [];
		for (let j = i + 2; j < lines.length && lines[j].trim().startsWith("|"); j++) {
			const c = splitRow(lines[j]);
			const id = clean(c[map.id] ?? "");
			if (!id) continue;
			if (tasks.some((t) => t.id === id)) {
				warnings.push(`ID trùng "${id}"`);
				continue;
			}
			const st = parseStatus$1(c[map.status] ?? "");
			if (st.status === "?") warnings.push(`${id}: ô Trạng thái sai hợp đồng — "${st.note}"`);
			tasks.push({
				id,
				title: clean(c[map.title] ?? ""),
				deps: parseDeps(c[map.deps] ?? ""),
				...st,
				who: map.who === void 0 ? "" : clean(c[map.who] ?? ""),
				files: map.files === void 0 ? [] : [...(c[map.files] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1])
			});
		}
		const ids = new Set(tasks.map((t) => t.id));
		for (const t of tasks) for (const d of t.deps) if (!ids.has(d)) warnings.push(`${t.id}: phụ thuộc lạ "${d}"`);
		return {
			tasks,
			warnings,
			cols: {
				id: map.id,
				status: map.status
			},
			idHeader: norm$1(cells[map.id]),
			headerLine: i,
			firstTableLine
		};
	}
	return {
		tasks: [],
		warnings: [],
		cols: null,
		idHeader: "",
		headerLine: -1,
		firstTableLine
	};
}
/** Lỗi R-132 của bảng trong `md`; `secMd` (mặc định `md`) chứa mục `### <ID>`, `null` = bỏ kiểm mục. Rỗng = đạt.
* @param {string} md @param {string | null} [secMd] @returns {string[]} */
function checkPlan(md, secMd = md) {
	const p = parsePlan$1(md);
	if (!p.cols) return ["không có bảng task đủ 4 cột `ID | Task | Phụ thuộc | Trạng thái`"];
	const errs = [];
	if (p.firstTableLine !== p.headerLine) errs.push("bảng tiến độ phải là bảng đầu tiên của file (bảng khác đặt sau)");
	if (p.idHeader === "#") errs.push("cột đầu tên `ID`, không dùng `#`");
	if (p.tasks.length === 0) errs.push("bảng tiến độ không có dòng task");
	const lines = (secMd ?? "").split(/\r?\n/);
	const inFence = fenceMask(lines);
	const heads = lines.filter((l, i) => !inFence[i] && /^#{2,4}\s/.test(l));
	for (const t of p.tasks) {
		if (t.status === "DONE" && !t.sha && !/\bPASS\b/.test(t.note)) errs.push(`${t.id}: DONE thiếu bằng chứng — sha trong backtick hoặc kết quả verify (\`DONE — PASS <lệnh>\`)`);
		if (t.status === "DOING" && /^chờ/i.test(t.note)) errs.push(`${t.id}: đang chờ USER thì ghi \`CHỜ-USER\`, không \`DOING — chờ…\``);
		if (secMd !== null && !hasSection(heads, t.id)) errs.push(`${t.id}: thiếu mục \`### Task <số>: <tên>\` (hoặc \`### ${t.id}: <tên>\`) mô tả việc + tiêu chí xong`);
	}
	for (const w of p.warnings) errs.push(/phụ thuộc lạ/.test(w) ? `${w} — ô Phụ thuộc chỉ liệt kê ID có trong bảng (không dải, không chữ), không có thì \`—\`` : w);
	return errs;
}
/** Lỗi front-matter ai tạo / lúc nào của `plan.md` (R-132); rỗng = đạt. @param {string} md @returns {string[]} */
function checkMeta(md) {
	const fm = (md.charCodeAt(0) === 65279 ? md.slice(1) : md).match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)?.[1] ?? "";
	/** @param {string} k */
	const get = (k) => {
		return (fm.split(/\r?\n/).map((l) => l.trimStart()).find((l) => l.startsWith(`${k}:`))?.slice(k.length + 1).trim() ?? "").replace(/^(['"])(.*)\1$/, "$2");
	};
	const errs = [];
	const boi = get("tao_boi");
	if (!boi) errs.push("thiếu front-matter `tao_boi: <git user.name> · <agent> (<model>)` ở đầu file");
	else if (/[<>]/.test(boi)) errs.push("`tao_boi` chưa điền — thay `<…>` bằng tên thật, vd `An · main (claude-opus-5-5)`");
	const luc = get("tao_luc");
	if (!luc) errs.push("thiếu front-matter `tao_luc: <YYYY-MM-DDTHH:MM±hh:mm>` ở đầu file");
	else if (!TAO_LUC.test(luc)) errs.push(`\`tao_luc\` sai dạng "${luc}" — cần \`YYYY-MM-DDTHH:MM±hh:mm\``);
	return errs;
}
/** Mọi chuỗi trong input tool trỏ tới `docs/artifact/<thư mục>/plan.md`. @param {unknown} v @param {string[]} out */
function planPaths(v, out = []) {
	if (typeof v === "string") {
		if (PLAN_PATH.test(v.trim())) out.push(v.trim());
	} else if (v && typeof v === "object") for (const x of Object.values(v)) planPaths(x, out);
	return out;
}
/** Thư mục tạo trước mốc `from` → không kiểm (không backfill). @param {string} file @param {string} [from] */
function isLegacy(file, from = R132_FROM) {
	const date = file.match(PLAN_PATH)?.[1].match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
	return !!date && date < from;
}
/** @param {string} f @returns {string | null} */
var readOr = (f) => {
	try {
		return fs.readFileSync(f, "utf8");
	} catch {
		return null;
	}
};
/** `progress.md` tồn tại mà không có bảng tiến độ hợp lệ = coi như không có. @param {string | null} md */
var hasTable = (md) => md !== null && parsePlan$1(md).cols !== null;
/** @param {string} file @param {string} cwd @param {number} now @returns {string[]} */
function reasonsFor(file, cwd, now) {
	const abs = path.resolve(cwd, file);
	if (isLegacy(abs)) return [];
	let st;
	try {
		st = fs.statSync(abs);
	} catch {
		return [];
	}
	if (now - st.mtimeMs > FRESH_MS) return [];
	const md = fs.readFileSync(abs, "utf8");
	const dir = path.dirname(abs);
	if (/progress\.md$/i.test(abs)) {
		const planMd = readOr(path.join(dir, "plan.md"));
		const errs = checkPlan(md, planMd);
		if (hasTable(planMd)) errs.push("hai nguồn tiến độ: `plan.md` còn bảng tiến độ — bỏ bảng khỏi `plan.md`, giữ ở `progress.md` (R-132)");
		return errs;
	}
	const meta = isLegacy(abs, "2026-10-08") ? [] : checkMeta(md);
	const progMd = readOr(path.join(dir, "progress.md"));
	if (progMd !== null && hasTable(progMd)) {
		const errs = checkPlan(progMd, md).filter((e) => /thiếu mục/.test(e));
		if (hasTable(md)) errs.unshift("bảng tiến độ đã ở `progress.md` — bỏ bảng khỏi `plan.md` (R-132)");
		return [...errs, ...meta];
	}
	const errs = checkPlan(md);
	if (errs[0]?.startsWith("không có bảng task")) errs[0] += " — plan mới đặt bảng trong `progress.md` cùng thư mục (R-132)";
	return [...errs, ...meta];
}
function main$1() {
	let payload = {};
	try {
		payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
	} catch {}
	const cwd = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
	const msgs = [];
	for (const f of new Set(planPaths(payload.tool_input))) {
		const errs = reasonsFor(f, cwd, Date.now());
		if (errs.length) msgs.push(`${f}:\n- ${errs.join("\n- ")}`);
	}
	if (!msgs.length) return;
	process.stdout.write(JSON.stringify({
		decision: "block",
		reason: `plan.md / progress.md sai hợp đồng R-132 (\`docs-standards\` › \`style.md\`) — sửa bảng tiến độ / front-matter:\n${msgs.join("\n")}`
	}));
}
if (process.argv[1]?.endsWith("plan-table.mjs")) {
	try {
		main$1();
	} catch {}
	process.exit(0);
}
//#endregion
//#region server/planGraph.ts
var DONE_LIKE$1 = /* @__PURE__ */ new Set(["DONE", "SKIP"]);
/** Chu trình phụ thuộc (DFS ba màu). Mỗi chu trình trả một lần, dạng [A, B, …, A]. Dep không có trong bảng: bỏ qua. */
function findCycles(tasks) {
	const deps = new Map(tasks.map((t) => [t.id, t.deps]));
	const color = /* @__PURE__ */ new Map();
	const stack = [];
	const out = [];
	const visit = (id) => {
		color.set(id, 1);
		stack.push(id);
		for (const d of deps.get(id) ?? []) {
			if (!deps.has(d)) continue;
			const c = color.get(d) ?? 0;
			if (c === 1) out.push([...stack.slice(stack.indexOf(d)), d]);
			else if (c === 0) visit(d);
		}
		stack.pop();
		color.set(id, 2);
	};
	for (const t of tasks) if (!color.get(t.id)) visit(t.id);
	return out;
}
/** Số task (trực tiếp + gián tiếp) phụ thuộc vào id. */
function downstream(id, tasks) {
	const seen = /* @__PURE__ */ new Set();
	const walk = (x) => {
		for (const t of tasks) if (t.deps.includes(x) && !seen.has(t.id)) {
			seen.add(t.id);
			walk(t.id);
		}
	};
	walk(id);
	seen.delete(id);
	return seen.size;
}
/** TODO có mọi dep DONE/SKIP (dep lạ = chưa xong), xếp: nhiều task phía sau trước, rồi ID tăng (số tự nhiên). */
function readyOrder(tasks) {
	const status = new Map(tasks.map((t) => [t.id, t.status]));
	const inCycle = new Set(findCycles(tasks).flat());
	const ready = tasks.filter((t) => t.status === "TODO" && !inCycle.has(t.id) && t.deps.every((d) => DONE_LIKE$1.has(status.get(d) ?? "")));
	const n = new Map(ready.map((t) => [t.id, downstream(t.id, tasks)]));
	return ready.sort((a, b) => n.get(b.id) - n.get(a.id) || a.id.localeCompare(b.id, void 0, { numeric: true })).map((t) => t.id);
}
//#endregion
//#region server/planTable.ts
var DONE_LIKE = ["DONE", "SKIP"];
var parseStatus = (cell) => parseStatus$1(cell);
function parsePlan(md) {
	const { tasks, warnings, cols } = parsePlan$1(md);
	const cycles = findCycles(tasks).map((c) => `chu trình phụ thuộc: ${c.join(" → ")}`);
	return {
		tasks,
		warnings: [...warnings, ...cycles],
		cols
	};
}
function isNext(task, all) {
	if (task.status !== "TODO") return false;
	const byId = new Map(all.map((t) => [t.id, t]));
	return task.deps.every((d) => DONE_LIKE.includes(byId.get(d)?.status ?? "?"));
}
function progress(tasks) {
	return {
		done: tasks.filter((t) => DONE_LIKE.includes(t.status)).length,
		total: tasks.length
	};
}
function taskBody(md, id) {
	const lines = md.split(/\r?\n/);
	const num = id.match(/^T(\d+)$/)?.[1];
	const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const sep = "(?:\\s*[:.—–-]|\\s|$)";
	const alts = [`(?:Task\\s+)?${esc}${sep}`, ...num ? [`Task\\s+${num}${sep}`, `${num}\\s*[:—–-]`] : []];
	const re = new RegExp(`^(#{2,4})\\s+(?:${alts.join("|")})`);
	let fence = false;
	const inFence = lines.map((l) => {
		if (/^\s*```/.test(l)) {
			fence = !fence;
			return true;
		}
		return fence;
	});
	const start = lines.findIndex((l, i) => !inFence[i] && re.test(l));
	if (start >= 0) {
		const level = lines[start].match(/^#+/)[0].length;
		let end = lines.length;
		for (let k = start + 1; k < lines.length; k++) {
			const h = !inFence[k] && lines[k].match(/^(#+)\s/);
			if (h && h[1].length <= level) {
				end = k;
				break;
			}
		}
		return lines.slice(start, end).join("\n").trim();
	}
	const bold = new RegExp(`^\\*\\*(?:Task\\s+)?${esc}${sep}`);
	const b = lines.findIndex((l, i) => !inFence[i] && bold.test(l));
	if (b < 0) return "";
	let end = lines.length;
	for (let k = b + 1; k < lines.length; k++) if (!inFence[k] && (/^#{1,6}\s/.test(lines[k]) || /^\*\*(?:Task\s+)?T?\d+\w*\s*[—–:-]/.test(lines[k]))) {
		end = k;
		break;
	}
	return lines.slice(b, end).join("\n").trim();
}
function taskAnchor(md, id) {
	return (taskBody(md, id).split("\n")[0] ?? "").replace(/^#+\s*/, "").replace(/[*`]/g, "").replace(/:\s*$/, "").trim();
}
//#endregion
//#region server/taskWindows.ts
var ms$1 = (iso) => Date.parse(iso);
var WRITE_TOOLS$2 = [
	"Write",
	"Edit",
	"NotebookEdit"
];
function parseGitLog(text, cols) {
	const out = [];
	let at = "";
	for (const line of text.split(/\r?\n/)) {
		if (line.startsWith("__C__")) {
			at = line.slice(5).trim();
			continue;
		}
		if (!line.startsWith("+|")) continue;
		const c = splitRow(line.slice(1));
		const id = (c[cols.id] ?? "").replace(/[*`]/g, "").trim();
		const st = parseStatus(c[cols.status] ?? "");
		if (id && st.status !== "?") out.push({
			taskId: id,
			status: st.status,
			at
		});
	}
	return out;
}
function windowOf(taskId, tr, now) {
	const mine = tr.filter((t) => t.taskId === taskId);
	const s = mine.find((t) => t.status !== "TODO");
	if (!s) return null;
	const e = mine.find((t) => ms$1(t.at) >= ms$1(s.at) && (t.status === "DONE" || t.status === "SKIP"));
	return {
		start: s.at,
		end: e ? e.at : now
	};
}
function sinceOf(taskId, tr, status) {
	const mine = tr.filter((t) => t.taskId === taskId);
	let since = null;
	for (let i = mine.length - 1; i >= 0 && mine[i].status === status; i--) since = mine[i].at;
	return since;
}
var touches = (ev, file) => {
	const f = normPath(file).replace(/^\.\//, "");
	return normPath(ev.target).endsWith(f) || normPath(ev.input).includes(f);
};
function assign(tasks, tr, events, now) {
	const wins = /* @__PURE__ */ new Map();
	for (const k of tasks) {
		const w = tr.length ? windowOf(k.id, tr, now) : null;
		if (w && ms$1(w.start) !== ms$1(w.end)) wins.set(k.id, [ms$1(w.start), ms$1(w.end)]);
	}
	const inWin = (t, id) => {
		const w = wins.get(id);
		return !!w && t >= w[0] && t <= w[1];
	};
	const result = /* @__PURE__ */ new Map();
	for (const k of tasks) {
		const matchesFile = (ev) => k.files.some((f) => touches(ev, f));
		let evs = [];
		let mode = "time";
		if (!wins.has(k.id)) {
			evs = events.filter(matchesFile);
			mode = "file";
		} else for (const ev of events) {
			const t = ms$1(ev.ts);
			if (!inWin(t, k.id)) continue;
			if (tasks.some((o) => o.id !== k.id && inWin(t, o.id))) {
				mode = "time+file";
				if (!matchesFile(ev)) continue;
			}
			evs.push(ev);
		}
		result.set(k.id, {
			events: evs,
			filterMode: mode,
			since: sinceOf(k.id, tr, k.status),
			filesTouched: Object.fromEntries(k.files.map((f) => [f, events.some((ev) => WRITE_TOOLS$2.includes(ev.tool) && touches(ev, f))]))
		});
	}
	return result;
}
/** Ngưỡng cảnh báo % context theo mức: 50% (warn), 65% (high), 80% (crit) (ECC scripts/hooks/ecc-statusline.js:35-52). */
var CONTEXT_LEVELS = {
	warn: 50,
	high: 65,
	crit: 80
};
/** Khoảng đệm auto-compact dự trữ của Claude Code (16.5% tương đương ~33k / 200k) (ECC scripts/hooks/ecc-statusline.js). */
var AUTO_COMPACT_BUFFER_PCT = 16.5;
/** Giới hạn byte đọc đuôi log để tránh tràn RAM: 2MB (ECC scripts/dashboard-web.js:936-968). */
var LOG_TAIL_BYTES = 2e6;
//#endregion
//#region server/insight.ts
var LIVE_MS = 12e4;
var VERIFY_RE = new RegExp(/(?:^|&&|;|\|)\s*(?:\w+=\S*\s+)*/.source + `(?:${[
	/(?:(?:python3?|py|node|pwsh|powershell|bash|sh|&)\s+(?:-File\s+)?)?\S*verify\.(?:py|ps1|sh|mjs|js|cmd)/,
	/dotnet\s+(?:build|test)/,
	/(?:pnpm|npm|yarn)\s+(?:(?:-C|--dir|--prefix|--filter)\s+\S+\s+)?(?:run\s+)?(?:typecheck|test|lint|check)/,
	/(?:(?:pnpm|npx)\s+(?:exec\s+)?)?(?:biome\s+(?:check|lint|ci)|vitest|playwright\s+test)/,
	/node\s+\S*(?:selftest|check-kit)\.mjs/,
	/apm\s+audit/
].map((r) => r.source).join("|")})` + /\b/.source, "m");
var WRITE_TOOLS$1 = [
	"Write",
	"Edit",
	"NotebookEdit"
];
var MAX_INPUTS = 15;
var ms = (iso) => Date.parse(iso);
var isReview = (e) => e.tool === "Agent" && /reviewer/i.test(e.target);
var isVerify = (e) => (e.tool === "Bash" || e.tool === "PowerShell") && VERIFY_RE.test(e.input.slice(0, 2e3));
function countChecks(events) {
	return {
		verifyPass: events.filter((e) => isVerify(e) && e.isError === false).length,
		verifyFail: events.filter((e) => isVerify(e) && e.isError === true).length,
		reviews: events.filter(isReview).length,
		runs: events.filter((e) => isVerify(e) || isReview(e)).slice(-100).map((e) => ({
			id: e.id,
			ts: e.ts,
			agent: e.agent,
			kind: isReview(e) ? "review" : "verify",
			label: isReview(e) ? e.why || e.target : e.input.split("\n")[0].slice(0, 160),
			result: e.isError === null ? "RUNNING" : e.isError ? "FAIL" : "PASS"
		}))
	};
}
function agentsOf(events, now, liveMs) {
	const by = /* @__PURE__ */ new Map();
	for (const e of events) {
		const a = by.get(e.agent) ?? {
			agent: e.agent,
			count: 0,
			lastTs: "",
			live: false
		};
		a.count++;
		if (e.ts > a.lastTs) a.lastTs = e.ts;
		by.set(e.agent, a);
	}
	for (const a of by.values()) a.live = now - ms(a.lastTs) < liveMs;
	return [...by.values()];
}
function avgDoneMs(tasks, tr) {
	const d = [];
	for (const t of tasks) {
		if (t.status !== "DONE") continue;
		const w = windowOf(t.id, tr, "");
		if (w?.end && ms(w.end) > ms(w.start)) d.push(ms(w.end) - ms(w.start));
	}
	return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
}
function estimateOf(task, tr, now, avgMs) {
	const w = task.status === "DOING" ? windowOf(task.id, tr, "") : null;
	const elapsedMs = w ? Math.max(0, now - ms(w.start)) : null;
	return {
		elapsedMs,
		avgMs,
		pct: elapsedMs !== null && avgMs ? Math.min(90, Math.round(elapsedMs / avgMs * 100)) : null,
		late: elapsedMs !== null && !!avgMs && elapsedMs > 1.5 * avgMs
	};
}
function flowOf(task, repoRoot) {
	const root = `${normPath(repoRoot).replace(/\/$/, "")}/`.toLowerCase();
	const rel = (p) => {
		const n = normPath(p);
		return n.toLowerCase().startsWith(root) ? n.slice(root.length) : n;
	};
	const inputs = [...new Set(task.events.filter((e) => e.tool === "Read").map((e) => rel(e.target)))].slice(0, MAX_INPUTS);
	const outputs = task.files.map((f) => ({
		file: f,
		touched: task.filesTouched[f] === true
	}));
	const known = new Set(task.files.map((f) => normPath(f).replace(/^\.\//, "")));
	for (const e of task.events) {
		if (!WRITE_TOOLS$1.includes(e.tool)) continue;
		const f = rel(e.target);
		if (!known.has(f)) {
			known.add(f);
			outputs.push({
				file: f,
				touched: false
			});
		}
	}
	return {
		inputs,
		outputs,
		evidence: {
			sha: task.sha,
			note: task.note
		},
		verification: countChecks(task.events)
	};
}
function runtimeOf(tasks, live) {
	const has = (s) => tasks.some((t) => t.status === s);
	if (has("BLOCKED")) return "BLOCKED";
	if (live) return tasks.filter((t) => t.status === "DOING").length >= 2 ? "PARALLEL" : "RUNNING";
	return has("CHỜ-USER") ? "WAITING" : "IDLE";
}
function evidenceSummary(tasks, events) {
	const done = tasks.filter((t) => t.status === "DONE");
	const ok = (t) => !!t.sha || !!t.note;
	return {
		done: done.length,
		withEvidence: done.filter(ok).length,
		...countChecks(events),
		missing: done.filter((t) => !ok(t)).map((t) => t.id)
	};
}
var STUCK_MS = 18e5;
var cut = (s) => s.slice(0, 160);
/** events đã sắp cũ → mới. Mỗi state có căn cứ ở lời gọi cuối của agent (plan §8.1). */
function agentRows(events, tasks, limit, now, liveMs) {
	const last = /* @__PURE__ */ new Map();
	for (const e of events) last.set(e.agent, e);
	const waitingUser = tasks.find((t) => t.status === "CHỜ-USER");
	const rows = [...last.values()].map((e) => {
		const task = tasks.find((t) => t.events.some((x) => x.id === e.id));
		const base = {
			agent: e.agent,
			taskId: task?.id ?? null,
			since: e.ts
		};
		const ask = e.tool === "AskUserQuestion" && e.isError === null;
		const fresh = now - ms(e.ts) < liveMs;
		if (e.isError === true && fresh) return {
			...base,
			state: "ERROR",
			detail: "tool lỗi"
		};
		if (limit && limit.sessionId === e.sessionId) return {
			...base,
			state: "ERROR",
			detail: "hết lượt API"
		};
		if (task?.status === "BLOCKED" && fresh) return {
			...base,
			state: "BLOCKED",
			detail: task.note
		};
		if (ask) return {
			...base,
			state: "WAITING",
			detail: cut(`USER · ${e.target || e.input}`)
		};
		if (fresh) return {
			...base,
			state: "RUNNING",
			detail: cut(`${e.tool} ${e.target}`.trim())
		};
		if (e.agent === "main" && waitingUser) return {
			...base,
			state: "WAITING",
			detail: cut(`USER · ${waitingUser.note}`)
		};
		if (e.agent !== "main" && e.isError === false) return {
			...base,
			state: "DONE",
			detail: "xong"
		};
		return {
			...base,
			state: "IDLE",
			detail: ""
		};
	});
	const existingAgents = new Set(rows.map((r) => r.agent));
	for (const t of tasks) {
		if (!t.who) continue;
		const declared = splitDeclaredAgents(t.who);
		for (const a of declared) {
			const base = declaredAgentName(a);
			if (!existingAgents.has(base)) {
				existingAgents.add(base);
				rows.push({
					agent: base,
					taskId: t.id,
					since: null,
					state: "IDLE",
					detail: ""
				});
			}
		}
	}
	return rows;
}
var waiting = (t) => t.status === "CHỜ-USER" || t.status === "BLOCKED";
function blockers(tasks) {
	const out = [];
	for (const t of tasks) if (waiting(t)) out.push({
		taskId: t.id,
		kind: t.status,
		reason: t.note,
		owner: t.status === "CHỜ-USER" ? "USER" : t.who,
		since: t.since
	});
	else if (t.status === "TODO") {
		const dep = tasks.find((d) => t.deps.includes(d.id) && waiting(d));
		if (dep) out.push({
			taskId: t.id,
			kind: "DEP",
			reason: `chờ ${dep.id} (${dep.status})`,
			owner: t.who,
			since: dep.since
		});
	}
	return out;
}
function failStreak(events) {
	let run = 0;
	for (const e of events) {
		if (!isVerify(e) || e.isError === null) continue;
		run = e.isError ? run + 1 : 0;
	}
	return run;
}
function stalledMs(t, limit, now) {
	if (limit && !(limit.type === "agy-429" && now - ms(limit.ts ?? "") > 72e5) || t.status !== "DOING" || t.events.length === 0) return null;
	const last = t.events.reduce((m, e) => {
		const x = ms(e.ts);
		return Number.isFinite(x) && x > m ? x : m;
	}, Number.NEGATIVE_INFINITY);
	return Number.isFinite(last) && now - last > 9e5 ? now - last : null;
}
var fmtDur = (x) => {
	const m = Math.round(x / 6e4);
	return m < 60 ? `${m} phút` : m % 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m / 60} giờ`;
};
var uncached$1 = (u) => u ? u.inputTokens + u.outputTokens + u.cacheCreationTokens : 0;
function anomalies(tasks, bl, limit, now, events, taskBudgetTokens = 5e5) {
	const out = [];
	const allEvents = events ?? tasks.flatMap((t) => t.events);
	for (const t of tasks) {
		if (t.status === "DOING" && !limit) {
			let hungEvent = null;
			let maxHungAge = -1;
			for (const e of t.events) if (e.isError === null && e.tool !== "AskUserQuestion") {
				const age = now - ms(e.ts);
				if (age > 18e5 && age <= 216e5) {
					if (!allEvents.some((e2) => e2.sessionId === e.sessionId && ms(e2.ts) > ms(e.ts)) && age > maxHungAge) {
						maxHungAge = age;
						hungEvent = e;
					}
				}
			}
			if (hungEvent) out.push({
				taskId: t.id,
				kind: "HUNG_TOOL",
				severity: "WARN",
				message: `${t.id} tool ${hungEvent.tool} chưa có kết quả sau ${fmtDur(maxHungAge)}`
			});
		}
		const { elapsedMs, avgMs } = t.estimate;
		const stalled = stalledMs(t, limit, now);
		if (stalled !== null) out.push({
			taskId: t.id,
			kind: "STALLED",
			severity: stalled > 27e5 ? "WARN" : "INFO",
			stalledMs: stalled,
			message: stalled > 27e5 ? `${t.id} đứng im ${fmtDur(stalled)} — agent có thể đã dừng, đang chờ duyệt quyền, hoặc hết lượt API` : `${t.id} im ${fmtDur(stalled)} — có thể đang build/test dài`
		});
		else if (t.status === "DOING" && elapsedMs !== null && avgMs && elapsedMs > 2 * avgMs) out.push({
			taskId: t.id,
			kind: "SLOW",
			severity: "WARN",
			message: `${t.id} chạy lâu gấp đôi trung bình`
		});
		if (t.status !== "DONE" && t.status !== "SKIP" && failStreak(t.events) >= 3) out.push({
			taskId: t.id,
			kind: "RETRY",
			severity: "WARN",
			message: `${t.id} verify lỗi liên tiếp 3 lần trở lên`
		});
		if (t.status === "DONE" && !t.sha && !t.note) out.push({
			taskId: t.id,
			kind: "NO_EVIDENCE",
			severity: "WARN",
			message: `${t.id} xong nhưng thiếu sha và ghi chú`
		});
		const writes = t.events.filter((e) => WRITE_TOOLS$1.includes(e.tool));
		const codeWrites = writes.filter((e) => !/\.md$/i.test(e.target));
		if (t.status === "DONE" && codeWrites.length) {
			const { ts: lastWrite, agent } = codeWrites[codeWrites.length - 1];
			const end = t.window?.end;
			if (!(events ?? t.events).some((e) => isVerify(e) && e.agent === agent && e.ts >= lastWrite && (!end || e.ts <= end))) out.push({
				taskId: t.id,
				kind: "NO_VERIFY_AFTER_EDIT",
				severity: "WARN",
				message: `${t.id} xong nhưng không chạy verify sau lần sửa cuối`
			});
		}
		if (t.status !== "SKIP") {
			const per = /* @__PURE__ */ new Map();
			for (const e of writes) per.set(e.target, (per.get(e.target) ?? 0) + 1);
			const [file, n] = [...per].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
			if (n >= 6) out.push({
				taskId: t.id,
				kind: "EDIT_THRASH",
				severity: "INFO",
				message: `${t.id} sửa ${file} ${n} lần`
			});
		}
		if (t.status !== "DONE" && t.status !== "SKIP") {
			const fails = /* @__PURE__ */ new Map();
			const lastFail = /* @__PURE__ */ new Map();
			let writeSeq = 0;
			for (const e of t.events) {
				if (WRITE_TOOLS$1.includes(e.tool)) writeSeq++;
				if (e.tool !== "Bash" && e.tool !== "PowerShell" || e.isError !== true || isVerify(e)) continue;
				const cmd = e.input.split("\n")[0].trim().slice(0, 200);
				fails.set(cmd, lastFail.get(cmd) === writeSeq ? (fails.get(cmd) ?? 0) + 1 : 1);
				lastFail.set(cmd, writeSeq);
			}
			const hit = [...fails].find(([, n]) => n >= 3);
			if (hit) out.push({
				taskId: t.id,
				kind: "BLIND_RETRY",
				severity: "WARN",
				message: `${t.id} chạy lại lệnh lỗi ${hit[1]} lần: ${hit[0].slice(0, 80)}`
			});
		}
		if (t.status !== "SKIP") {
			let curRun = [];
			let reportedLoop = false;
			for (const e of t.events) if (curRun.length > 0 && e.tool === curRun[0].tool && e.input === curRun[0].input) curRun.push(e);
			else {
				if (curRun.length >= 5 && !curRun.every((x) => x.isError === true)) {
					out.push({
						taskId: t.id,
						kind: "TOOL_LOOP",
						severity: "WARN",
						message: `${t.id} gọi lặp ${curRun[0].tool} ${curRun.length} lần liên tiếp cùng tham số`
					});
					reportedLoop = true;
					break;
				}
				curRun = [e];
			}
			if (!reportedLoop && curRun.length >= 5 && !curRun.every((x) => x.isError === true)) out.push({
				taskId: t.id,
				kind: "TOOL_LOOP",
				severity: "WARN",
				message: `${t.id} gọi lặp ${curRun[0].tool} ${curRun.length} lần liên tiếp cùng tham số`
			});
		}
		const taskUncached = uncached$1(t.tokens);
		if (t.status === "DOING" && taskUncached > taskBudgetTokens) out.push({
			taskId: t.id,
			kind: "BUDGET_OVERRUN",
			severity: "CRIT",
			message: `${t.id} vượt ngưỡng token khuyến nghị (${taskUncached.toLocaleString("en-US")} / ${taskBudgetTokens.toLocaleString("en-US")} tokens chưa cache)`
		});
	}
	const owner = /* @__PURE__ */ new Map();
	for (const t of tasks) for (const x of t.events) owner.set(x.id, t.id);
	const seen = /* @__PURE__ */ new Set();
	for (const e of allEvents) {
		if (seen.has(e.id)) continue;
		seen.add(e.id);
		const n = uncached$1(e.usage);
		if (n <= 2e5) continue;
		const taskId = owner.get(e.id) ?? null;
		out.push({
			taskId,
			kind: "TOKEN_SPIKE",
			severity: "WARN",
			message: `${taskId ? `${taskId} · ` : ""}tool ${e.tool} tiêu tốn ${n.toLocaleString("en-US")} tokens chưa cache`
		});
	}
	for (const b of bl) if (b.kind === "DEP" && b.since && now - ms(b.since) > STUCK_MS) out.push({
		taskId: b.taskId,
		kind: "DEP_STUCK",
		severity: "WARN",
		message: `${b.taskId} ${b.reason} quá 30 phút`
	});
	if (limit) out.push({
		taskId: null,
		kind: "API_LIMIT",
		severity: "CRIT",
		message: "phiên bị giới hạn API"
	});
	return out;
}
//#endregion
//#region server/contextWindow.ts
var CONTEXT_WINDOW = {
	"claude-fable-5": 2e5,
	"claude-opus-5": 2e5,
	"claude-opus-4": 2e5,
	"claude-sonnet-5": 2e5,
	"claude-sonnet-4": 2e5,
	"claude-sonnet-3-7": 2e5,
	"claude-sonnet-3-5": 2e5,
	"claude-haiku-4": 2e5,
	"claude-haiku-3-5": 2e5,
	"gemini-3.8-flash": 1e6,
	"gemini-3.7-flash": 1e6,
	"gemini-3.6-flash": 1e6,
	"gemini-3.5-flash": 1e6,
	"gemini-3.1-pro": 2e6,
	"gemini-3-flash": 1e6,
	"gemini-2.5-pro": 2e6,
	"gemini-2.5-flash": 1e6,
	"gemini-2.0-flash": 1e6,
	"gemini-1.5-pro": 2e6,
	"gemini-1.5-flash": 1e6
};
var FALLBACK_CONTEXT_WINDOW = 2e5;
function contextWindow(model) {
	if (!model) return FALLBACK_CONTEXT_WINDOW;
	const m = model.toLowerCase().trim();
	let best = "";
	for (const k of Object.keys(CONTEXT_WINDOW)) if (m.startsWith(k) && k.length > best.length) best = k;
	return best ? CONTEXT_WINDOW[best] : FALLBACK_CONTEXT_WINDOW;
}
/**
* Model Claude không cho biết phiên 1M (id không có hậu tố [1m]): tokens vượt ngưỡng dùng được của 200k
* thì chắc chắn là 1M. Trả cờ estimated để UI hiện nhãn "ước lượng".
*/
function windowFor(model, tokens) {
	const window = contextWindow(model);
	if (!!model && model.toLowerCase().trim().startsWith("claude") && window === 2e5 && tokens > window * (1 - 16.5 / 100)) return {
		window: 1e6,
		estimated: true
	};
	return {
		window,
		estimated: false
	};
}
function resolveWindow(model, tokens, logged) {
	return logged !== void 0 && Number.isInteger(logged) && logged > 0 ? {
		window: logged,
		estimated: false
	} : windowFor(model, tokens);
}
function gauge(tokens, window) {
	const rawPct = tokens / (window * (1 - AUTO_COMPACT_BUFFER_PCT / 100)) * 100;
	const pct = Math.round(rawPct * 10) / 10;
	let level = "OK";
	if (pct >= CONTEXT_LEVELS.crit) level = "CRIT";
	else if (pct >= CONTEXT_LEVELS.high) level = "HIGH";
	else if (pct >= CONTEXT_LEVELS.warn) level = "WARN";
	return {
		pct,
		level
	};
}
//#endregion
//#region server/hints.ts
var REREAD_MIN = 5;
var BIG_RESULT_CHARS = 2e5;
var OUTLIER_FACTOR = 6;
var OUTLIER_MIN_TOKENS = 5e4;
var OUTLIER_MIN_BASE_RUNS = 5;
var LOW_CACHE_MIN_TOKENS = 1e5;
var LOW_CACHE_RATE = .4;
var k = (n) => `${Math.round(n / 1e3)}k`;
var uncached = (e) => e.usage ? e.usage.inputTokens + e.usage.outputTokens + e.usage.cacheCreationTokens : 0;
function runTotals(events) {
	const m = /* @__PURE__ */ new Map();
	for (const e of events) {
		if (!e.run) continue;
		const r = m.get(e.run) ?? {
			agent: e.agent,
			tokens: 0,
			first: e
		};
		r.tokens += uncached(e);
		m.set(e.run, r);
	}
	return m;
}
function hints(mine, all, sessionEvents, owner) {
	const out = [];
	const reads = /* @__PURE__ */ new Map();
	for (const e of mine) {
		if (e.agent !== "main" || e.tool !== "Read") continue;
		const key = `${e.sessionId}·${e.target}`;
		const l = reads.get(key);
		if (l) l.push(e);
		else reads.set(key, [e]);
	}
	for (const [key, list] of reads) {
		if (list.length <= REREAD_MIN) continue;
		out.push({
			key: `REREAD·${key}`,
			kind: "REREAD",
			taskId: owner.get(list[0].id) ?? null,
			message: `đọc lại ${list[0].target} ${list.length} lần trong một phiên`,
			basis: "đo"
		});
	}
	for (const e of mine) {
		const chars = e.resultChars ?? 0;
		if (chars <= BIG_RESULT_CHARS) continue;
		out.push({
			key: `BIG_RESULT·${e.id}`,
			kind: "BIG_RESULT",
			taskId: owner.get(e.id) ?? null,
			message: `kết quả ${e.tool} ~${k(chars / 4)} token (ước từ ${k(chars)} ký tự)`,
			basis: "ước lượng"
		});
	}
	const allRuns = runTotals(all);
	const agg = /* @__PURE__ */ new Map();
	for (const o of allRuns.values()) {
		const a = agg.get(o.agent) ?? {
			sum: 0,
			n: 0
		};
		a.sum += o.tokens;
		a.n++;
		agg.set(o.agent, a);
	}
	for (const [run, r] of runTotals(mine)) {
		const a = agg.get(r.agent) ?? {
			sum: 0,
			n: 0
		};
		const own = allRuns.get(run);
		const inAll = own?.agent === r.agent;
		const n = a.n - (inAll ? 1 : 0);
		if (n < OUTLIER_MIN_BASE_RUNS) continue;
		const mean = (a.sum - (inAll ? own.tokens : 0)) / n;
		if (r.tokens <= OUTLIER_FACTOR * mean || r.tokens <= OUTLIER_MIN_TOKENS) continue;
		out.push({
			key: `SUBAGENT_OUTLIER·${run}`,
			kind: "SUBAGENT_OUTLIER",
			taskId: owner.get(r.first.id) ?? null,
			message: `lượt ${r.agent} tốn ${k(r.tokens)} token chưa cache, gấp ${Math.round(r.tokens / mean)}× trung bình ${k(mean)}`,
			basis: "đo"
		});
	}
	let read = 0;
	let create = 0;
	let input = 0;
	for (const e of mine) {
		read += e.usage?.cacheReadTokens ?? 0;
		create += e.usage?.cacheCreationTokens ?? 0;
		input += e.usage?.inputTokens ?? 0;
	}
	const cacheTotal = read + create;
	const rate = read / (cacheTotal + input);
	if (cacheTotal > LOW_CACHE_MIN_TOKENS && rate < LOW_CACHE_RATE) out.push({
		key: "LOW_CACHE",
		kind: "LOW_CACHE",
		taskId: null,
		message: `cache-hit ${Math.round(rate * 100)}% trên ${k(cacheTotal)} token cache`,
		basis: "đo"
	});
	const bySession = /* @__PURE__ */ new Map();
	for (const e of [...mine].sort((a, b) => a.ts.localeCompare(b.ts))) {
		const l = bySession.get(e.sessionId);
		if (l) l.push(e);
		else bySession.set(e.sessionId, [e]);
	}
	const lastBefore = (list, ts) => {
		let lo = 0;
		let hi = (list?.length ?? 0) - 1;
		let at;
		while (list && lo <= hi) {
			const mid = lo + hi >> 1;
			if (list[mid].ts <= ts) {
				at = list[mid];
				lo = mid + 1;
			} else hi = mid - 1;
		}
		return at;
	};
	const misses = /* @__PURE__ */ new Map();
	const sorted = sessionEvents.filter((s) => s.kind !== "BASE").sort((a, b) => a.ts.localeCompare(b.ts));
	for (const s of sorted) {
		if (s.kind === "CACHE_MISS") {
			const m = misses.get(s.detail);
			if (m) m.n++;
			else {
				const hint = {
					key: `CACHE_MISS·${s.detail}`,
					kind: "CACHE_MISS",
					taskId: null,
					message: "",
					basis: "đo"
				};
				misses.set(s.detail, {
					n: 1,
					hint
				});
				out.push(hint);
			}
			continue;
		}
		const prev = lastBefore(bySession.get(s.sessionId), s.ts);
		const message = s.kind === "COMPACT" ? `nén context (${s.detail}) ở ${k(s.tokens ?? 0)} token` : s.kind === "HOOK_BLOCK" ? `hook chặn agent: ${s.detail}` : s.kind === "HOOK_ERROR" ? `hook lỗi: ${s.detail}` : `lỗi API, ${s.detail}`;
		out.push({
			key: `${s.kind}·${s.sessionId}·${s.ts}`,
			kind: s.kind,
			taskId: prev ? owner.get(prev.id) ?? null : null,
			message,
			basis: "đo"
		});
	}
	for (const [detail, m] of misses) m.hint.message = `cache miss: ${detail} ${m.n} lần`;
	return out;
}
//#endregion
//#region server/pricing.ts
var FALLBACK_RATES = {
	input: 2,
	output: 10,
	cacheWrite: 2.5,
	cacheRead: .2
};
var PRICING_TABLE = {
	"claude-fable-5": {
		input: 10,
		output: 50,
		cacheWrite: 12.5,
		cacheRead: .25
	},
	"claude-opus-5": {
		input: 5,
		output: 25,
		cacheWrite: 6.25,
		cacheRead: .5
	},
	"claude-opus-5-5": {
		input: 4,
		output: 20,
		cacheWrite: 5,
		cacheRead: .2
	},
	"claude-opus-4-8": {
		input: 5,
		output: 25,
		cacheWrite: 6.25,
		cacheRead: .5
	},
	"claude-opus-4-7": {
		input: 5,
		output: 25,
		cacheWrite: 6.25,
		cacheRead: .5
	},
	"claude-opus-4-6": {
		input: 5,
		output: 25,
		cacheWrite: 6.25,
		cacheRead: .5
	},
	"claude-sonnet-5": {
		input: 2,
		output: 10,
		cacheWrite: 2.5,
		cacheRead: .2
	},
	"claude-sonnet-4-6": {
		input: 3,
		output: 15,
		cacheWrite: 3.75,
		cacheRead: .3
	},
	"claude-haiku-4-5": {
		input: 1,
		output: 5,
		cacheWrite: 1.25,
		cacheRead: .1
	},
	"gemini-3.8-flash": {
		input: .75,
		output: 3.75,
		cacheWrite: 0,
		cacheRead: .075
	},
	"gemini-3.7-flash": {
		input: .75,
		output: 3.75,
		cacheWrite: 0,
		cacheRead: .075
	},
	"gemini-3.6-flash": {
		input: .75,
		output: 3.75,
		cacheWrite: 0,
		cacheRead: .075
	},
	"gemini-3.5-flash": {
		input: 1.5,
		output: 9,
		cacheWrite: 0,
		cacheRead: .15
	},
	"gemini-3.5-flash-lite": {
		input: .3,
		output: 2.5,
		cacheWrite: 0,
		cacheRead: .03
	},
	"gemini-3.1-pro": {
		input: 2,
		output: 12,
		cacheWrite: 0,
		cacheRead: .2
	},
	"gemini-3.1-flash-lite": {
		input: .25,
		output: 1.5,
		cacheWrite: 0,
		cacheRead: .025
	},
	"gemini-3-flash": {
		input: .5,
		output: 3,
		cacheWrite: 0,
		cacheRead: .05
	},
	"gemini-2.5-pro": {
		input: 1.25,
		output: 10,
		cacheWrite: 0,
		cacheRead: .125
	},
	"gemini-2.5-flash": {
		input: .3,
		output: 2.5,
		cacheWrite: 0,
		cacheRead: .03
	},
	"gemini-2.5-flash-lite": {
		input: .1,
		output: .4,
		cacheWrite: 0,
		cacheRead: .01
	},
	"gpt-6.1-sol": {
		input: 2,
		cacheRead: .1,
		output: 10,
		cacheWrite: 0
	},
	"gpt-6-sol": {
		input: 2,
		cacheRead: .2,
		output: 10,
		cacheWrite: 0
	},
	"gpt-6-luna": {
		input: .1,
		cacheRead: .01,
		output: .5,
		cacheWrite: 0
	},
	"gpt-6-astra": {
		input: 10,
		cacheRead: 1,
		output: 50,
		cacheWrite: 12.5
	},
	"gpt-5.6-sol": {
		input: 4,
		cacheRead: .4,
		output: 20,
		cacheWrite: 5
	},
	"gpt-5.6-terra": {
		input: 2,
		cacheRead: .2,
		output: 12,
		cacheWrite: 0
	},
	"gpt-5.6-luna": {
		input: .2,
		cacheRead: .02,
		output: 1.2,
		cacheWrite: 0
	},
	"gpt-5.5": {
		input: 5,
		cacheRead: .5,
		output: 30,
		cacheWrite: 0
	},
	"gpt-5.4": {
		input: 2.5,
		cacheRead: .25,
		output: 15,
		cacheWrite: 0
	},
	"gpt-5.3-codex": {
		input: 1.75,
		cacheRead: .175,
		output: 14,
		cacheWrite: 0
	}
};
function getModelRates(model) {
	if (!model) return FALLBACK_RATES;
	const m = model.toLowerCase().trim();
	let best = "";
	for (const k of Object.keys(PRICING_TABLE)) if (m.startsWith(k) && k.length > best.length) best = k;
	return best ? PRICING_TABLE[best] : FALLBACK_RATES;
}
var round4 = (x) => Math.round(x * 1e4) / 1e4;
function rawCostUsd(usage, rates) {
	return ((usage.inputTokens ?? 0) * rates.input + (usage.outputTokens ?? 0) * rates.output + (usage.cacheCreationTokens ?? 0) * rates.cacheWrite + (usage.cacheReadTokens ?? 0) * rates.cacheRead) / 1e6;
}
function cacheHitRate(usage) {
	const d = (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0);
	return d > 0 ? round4((usage.cacheReadTokens ?? 0) / d) : 0;
}
/** Chi phí = tổng chi phí từng event theo model của event đó. */
function aggregateCost(events) {
	const total = aggregateTokens(events);
	if (!total) return void 0;
	let raw = 0;
	for (const e of events) if (e.usage) raw += rawCostUsd(e.usage, getModelRates(e.model));
	return {
		costUsd: round4(raw),
		cacheHitRate: cacheHitRate(total)
	};
}
function aggregateTokens(events) {
	let hasTokens = false;
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheReadTokens = 0;
	let cacheCreationTokens = 0;
	let estimated = false;
	for (const e of events) if (e.usage) {
		hasTokens = true;
		if (e.usage.estimated) estimated = true;
		inputTokens += e.usage.inputTokens ?? 0;
		outputTokens += e.usage.outputTokens ?? 0;
		cacheReadTokens += e.usage.cacheReadTokens ?? 0;
		cacheCreationTokens += e.usage.cacheCreationTokens ?? 0;
	}
	if (!hasTokens) return void 0;
	return {
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheCreationTokens,
		totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
		...estimated ? { estimated: true } : {}
	};
}
//#endregion
//#region server/adapters/claudeAdapter.ts
function extractClaudeUsage(raw) {
	if (!raw || typeof raw !== "object") return null;
	const o = raw;
	const msg = o.message && typeof o.message === "object" ? o.message : o;
	const u = msg.usage && typeof msg.usage === "object" ? msg.usage : o.usage && typeof o.usage === "object" ? o.usage : null;
	const model = typeof msg.model === "string" ? msg.model : typeof o.model === "string" ? o.model : void 0;
	if (!u) return model ? { model } : null;
	const inputTokens = Number(u.input_tokens ?? u.inputTokens ?? 0) || 0;
	const outputTokens = Number(u.output_tokens ?? u.outputTokens ?? 0) || 0;
	const cacheReadTokens = Number(u.cache_read_input_tokens ?? u.cacheReadTokens ?? 0) || 0;
	const cacheCreationTokens = Number(u.cache_creation_input_tokens ?? u.cacheCreationTokens ?? 0) || 0;
	return {
		usage: {
			inputTokens,
			outputTokens,
			cacheReadTokens,
			cacheCreationTokens,
			totalTokens: Number(u.total_tokens ?? u.totalTokens) || inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
		},
		model
	};
}
function parseClaudeLine(line, ctx) {
	let o;
	try {
		o = JSON.parse(line);
	} catch {
		return;
	}
	if (o.error === "rate_limit" && ctx.limits) {
		const prev = ctx.limits.get(ctx.sessionId);
		const ts = o.timestamp ?? "";
		if (!prev || prev.ts <= ts) ctx.limits.set(ctx.sessionId, {
			ts,
			resetsAt: (o.quotaLimits?.resetsAt ?? 0) * 1e3,
			type: o.quotaLimits?.rateLimitType ?? ""
		});
	}
	const push = (kind, detail, tokens, extra) => ctx.sessionEvents?.push({
		sessionId: ctx.sessionId,
		ts: o.timestamp ?? "",
		agent: ctx.agent,
		kind,
		detail,
		...tokens !== void 0 ? { tokens } : {},
		...extra
	});
	if (o.type === "system" && o.subtype === "compact_boundary") push("COMPACT", String(o.compactMetadata?.trigger ?? ""), Number(o.compactMetadata?.preTokens) || 0);
	if (o.type === "system" && o.subtype === "api_error") push("API_ERROR", `thử lại ${o.retryAttempt ?? "?"}/${o.maxRetries ?? "?"}`);
	const at = o.type === "attachment" ? o.attachment : void 0;
	if (at?.type === "hook_blocking_error" || at?.type === "hook_non_blocking_error") push(at.type === "hook_blocking_error" ? "HOOK_BLOCK" : "HOOK_ERROR", `${at.hookEvent ?? "?"} · ${at.hookName ?? "?"}`);
	const miss = o.message?.diagnostics?.cache_miss_reason?.type;
	if (typeof miss === "string") {
		const mid = o.message?.id;
		if (!mid || !ctx.missSeen?.has(mid)) {
			if (mid) (ctx.missSeen ??= /* @__PURE__ */ new Set()).add(mid);
			push("CACHE_MISS", miss);
		}
	}
	if (o.message?.role === "user") ctx.lastText = "";
	const extracted = extractClaudeUsage(o);
	const msgId = o.message?.id;
	if (extracted?.usage && !(msgId && ctx.seenMsg?.has(msgId))) {
		if (msgId) (ctx.seenMsg ??= /* @__PURE__ */ new Set()).add(msgId);
		ctx.pendingUsage = aggregateTokens([{ usage: ctx.pendingUsage }, { usage: extracted.usage }]);
		if (ctx.agent === "main") {
			const u = extracted.usage;
			const ctxTokens = u.inputTokens + u.cacheCreationTokens + u.cacheReadTokens;
			if (!ctx.baseSeen) {
				ctx.baseSeen = true;
				push("BASE", "", ctxTokens, {
					parts: {
						input: u.inputTokens,
						cacheCreation: u.cacheCreationTokens,
						cacheRead: u.cacheReadTokens
					},
					...extracted.model ? { model: extracted.model } : {}
				});
			}
			if (ctx.sessionEvents) {
				const ev = {
					sessionId: ctx.sessionId,
					ts: o.timestamp ?? "",
					agent: ctx.agent,
					kind: "CTX",
					tokens: ctxTokens,
					detail: "",
					...extracted.model ? { model: extracted.model } : {}
				};
				const idx = ctx.sessionEvents.findIndex((e) => e.sessionId === ctx.sessionId && e.kind === "CTX");
				if (idx >= 0) ctx.sessionEvents[idx] = ev;
				else ctx.sessionEvents.push(ev);
			}
		}
	}
	if (extracted?.model) ctx.lastModel = extracted.model;
	const content = o.message?.content;
	if (!Array.isArray(content)) return;
	for (const x of content) {
		if (x.type === "text" && o.message?.role === "assistant" && typeof x.text === "string") ctx.lastText = maskWhy(x.text);
		if (x.type === "tool_use" && x.id && x.name) {
			const usage = ctx.pendingUsage;
			ctx.pendingUsage = void 0;
			const ev = {
				id: x.id,
				sessionId: ctx.sessionId,
				ts: o.timestamp ?? "",
				agent: ctx.agent,
				tool: x.name,
				...describeInput(x.name, x.input ?? {}),
				isError: null,
				why: x.name === "Agent" ? maskWhy(String(x.input?.description ?? "")) : ctx.lastText,
				...usage ? { usage } : {},
				...ctx.lastModel ? { model: ctx.lastModel } : {},
				...ctx.run ? { run: ctx.run } : {}
			};
			ctx.lastText = "";
			ctx.byId.set(ev.id, ev);
			ctx.out.push(ev);
		} else if (x.type === "tool_result" && x.tool_use_id) {
			const ev = ctx.byId.get(x.tool_use_id);
			if (ev) {
				ev.isError = x.is_error === true;
				ev.resultChars = typeof x.content === "string" ? x.content.length : Array.isArray(x.content) ? x.content.reduce((n, b) => n + (b?.type === "text" && typeof b.text === "string" ? b.text.length : 0), 0) : JSON.stringify(x.content ?? "").length;
			}
		}
	}
}
//#endregion
//#region server/transcript.ts
function transcriptDir(repoRoot) {
	return path.join(os.homedir(), ".claude", "projects", repoRoot.replace(/[^a-zA-Z0-9]/g, "-"));
}
var parseLine = parseClaudeLine;
var CHUNK$2 = 1048576;
var DAY_MS$3 = 864e5;
var RESULT_KEEP_MS = 36e5;
var INPUT_KEEP_MS = 7 * DAY_MS$3;
var TranscriptIndex = class {
	events = [];
	sessionEvents = [];
	lastWrite = /* @__PURE__ */ new Map();
	limits = /* @__PURE__ */ new Map();
	windowDays = 30;
	version = 0;
	dir;
	now;
	files = /* @__PURE__ */ new Map();
	byId = /* @__PURE__ */ new Map();
	pendingFiles = null;
	nextFile = 0;
	constructor(dir, now = Date.now, windowDays) {
		this.dir = dir;
		this.now = now;
		if (windowDays !== void 0) this.windowDays = windowDays;
	}
	/** id các event còn trong byId (để test giới hạn bộ nhớ). */
	byIds() {
		return [...this.byId.keys()];
	}
	setWindowDays(days) {
		if (this.windowDays !== null && (days === null || days > this.windowDays)) {
			this.windowDays = days;
			this.version++;
		}
	}
	refresh() {
		this.refreshStep(Infinity);
	}
	refreshStep(deadline) {
		if (!this.pendingFiles) {
			if (!fs.existsSync(this.dir)) return true;
			this.pendingFiles = this.list();
			this.nextFile = 0;
		}
		try {
			while (this.nextFile < this.pendingFiles.length) {
				if (this.read(this.pendingFiles[this.nextFile], deadline)) return false;
				this.nextFile++;
				if (this.nextFile < this.pendingFiles.length && performance.now() >= deadline) return false;
			}
		} catch (error) {
			this.pendingFiles = null;
			throw error;
		}
		this.pendingFiles = null;
		this.trim();
		return true;
	}
	trim() {
		const t = this.now();
		for (const [id, ev] of this.byId) if (ev.isError !== null && t - Date.parse(ev.ts) > RESULT_KEEP_MS) this.byId.delete(id);
		for (const ev of this.events) if (ev.input !== "" && t - Date.parse(ev.ts) > INPUT_KEEP_MS) ev.input = "";
	}
	list() {
		const out = [];
		for (const e of fs.readdirSync(this.dir, { withFileTypes: true })) if (e.isFile() && e.name.endsWith(".jsonl")) out.push(path.join(this.dir, e.name));
		else if (e.isDirectory()) {
			const sub = path.join(this.dir, e.name, "subagents");
			if (fs.existsSync(sub)) {
				for (const s of fs.readdirSync(sub)) if (s.endsWith(".jsonl")) out.push(path.join(sub, s));
			}
		}
		return out;
	}
	ctxFor(file) {
		const isSub = path.basename(path.dirname(file)) === "subagents";
		const sessionId = isSub ? path.basename(path.dirname(path.dirname(file))) : path.basename(file, ".jsonl");
		let agent = "main";
		if (isSub) {
			agent = "subagent";
			try {
				agent = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, ".meta.json"), "utf8")).agentType ?? agent;
			} catch {}
		}
		return {
			sessionId,
			agent,
			byId: this.byId,
			out: this.events,
			lastText: "",
			limits: this.limits,
			sessionEvents: this.sessionEvents,
			...isSub ? { run: path.basename(file, ".jsonl") } : {}
		};
	}
	read(file, deadline) {
		let stat;
		try {
			stat = fs.statSync(file);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			this.files.delete(file);
			return false;
		}
		let st = this.files.get(file);
		if (!st) {
			if (this.windowDays !== null && this.now() - stat.mtimeMs > this.windowDays * DAY_MS$3) return false;
			st = {
				offset: 0,
				rest: "",
				decoder: new StringDecoder("utf8"),
				ctx: this.ctxFor(file)
			};
			this.files.set(file, st);
		}
		if (stat.size <= st.offset) return false;
		let fd;
		try {
			fd = fs.openSync(file, "r");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			this.files.delete(file);
			return false;
		}
		const buf = Buffer.alloc(Math.min(CHUNK$2, stat.size - st.offset));
		let stopped = false;
		try {
			while (st.offset < stat.size) {
				const n = fs.readSync(fd, buf, 0, Math.min(buf.length, stat.size - st.offset), st.offset);
				if (n <= 0) break;
				st.offset += n;
				this.version++;
				const lines = (st.rest + st.decoder.write(buf.subarray(0, n))).split("\n");
				st.rest = lines.pop() ?? "";
				for (const l of lines) if (l) parseLine(l, st.ctx);
				if (performance.now() >= deadline && st.offset < stat.size) {
					stopped = true;
					break;
				}
			}
		} finally {
			fs.closeSync(fd);
		}
		const sid = st.ctx.sessionId;
		this.lastWrite.set(sid, Math.max(this.lastWrite.get(sid) ?? 0, stat.mtimeMs));
		return stopped;
	}
};
//#endregion
//#region server/adapters/agyAdapter.ts
var agyPath = (p) => normPath(p.replace(/^["']+|["']+$/g, "")).replace(/\/{2,}/g, "/");
var agyRepoNorm = (repoRoot) => agyPath(repoRoot).toLowerCase();
var LIMIT_REGEX = /overloaded|rate.?limit|quota|resource.?exhausted/i;
var NOISE_TYPES = /* @__PURE__ */ new Set([
	"ERROR_MESSAGE",
	"SYSTEM_MESSAGE",
	"CHECKPOINT"
]);
function checkRepoPath(val, repoNorm) {
	if (typeof val === "string") {
		if (agyPath(val).toLowerCase().includes(repoNorm)) return true;
	} else if (Array.isArray(val)) {
		for (const item of val) if (checkRepoPath(item, repoNorm)) return true;
	} else if (val && typeof val === "object") {
		for (const v of Object.values(val)) if (checkRepoPath(v, repoNorm)) return true;
	}
	return false;
}
function extractAgyUsage(raw) {
	if (!raw || typeof raw !== "object") return null;
	const o = raw;
	const model = typeof o.model === "string" ? o.model : typeof o.model_name === "string" ? o.model_name : typeof o.modelName === "string" ? o.modelName : void 0;
	const meta = o.usage_metadata ?? o.usageMetadata ?? o.usage;
	if (meta && typeof meta === "object") {
		const n = (v) => Number(v ?? 0) || 0;
		const cacheReadTokens = n(meta.cached_content_token_count ?? meta.cachedContentTokenCount ?? meta.cache_read_input_tokens ?? meta.cacheReadTokens);
		const prompt = meta.prompt_token_count ?? meta.promptTokenCount;
		const inputTokens = prompt !== void 0 ? Math.max(0, n(prompt) - cacheReadTokens) : n(meta.input_tokens ?? meta.inputTokens);
		const outputTokens = n(meta.candidates_token_count ?? meta.candidatesTokenCount ?? meta.output_tokens ?? meta.outputTokens) + n(meta.thoughts_token_count ?? meta.thoughtsTokenCount);
		const cacheCreationTokens = n(meta.cache_creation_input_tokens ?? meta.cacheCreationTokens);
		return {
			usage: {
				inputTokens,
				outputTokens,
				cacheReadTokens,
				cacheCreationTokens,
				totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
			},
			model
		};
	}
	const tc = o.token_count ?? o.tokenCount;
	if (typeof tc === "number") return {
		usage: {
			inputTokens: tc,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheCreationTokens: 0,
			totalTokens: tc
		},
		model
	};
	else if (tc && typeof tc === "object") {
		const tco = tc;
		const inputTokens = Number(tco.input ?? tco.input_tokens ?? tco.prompt_tokens ?? tco.prompt_token_count ?? 0) || 0;
		const outputTokens = Number(tco.output ?? tco.output_tokens ?? tco.candidates_tokens ?? tco.candidates_token_count ?? 0) || 0;
		const cacheReadTokens = Number(tco.cached ?? tco.cache_read ?? tco.cached_content_token_count ?? 0) || 0;
		const cacheCreationTokens = Number(tco.cache_creation ?? 0) || 0;
		return {
			usage: {
				inputTokens,
				outputTokens,
				cacheReadTokens,
				cacheCreationTokens,
				totalTokens: Number(tco.total ?? tco.total_tokens) || inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
			},
			model
		};
	}
	if (o.type === "PLANNER_RESPONSE") {
		const content = typeof o.content === "string" ? o.content : "";
		const thinking = typeof o.thinking === "string" ? o.thinking : "";
		const toolChars = Array.isArray(o.tool_calls) ? JSON.stringify(o.tool_calls).length : 0;
		const outputTokens = Math.round((content.length + thinking.length + toolChars) / 4);
		if (outputTokens > 0) return {
			usage: {
				inputTokens: 0,
				outputTokens,
				cacheReadTokens: 0,
				cacheCreationTokens: 0,
				totalTokens: outputTokens,
				estimated: true
			},
			model
		};
	}
	return model ? { model } : null;
}
function parseAgyLine(line, ctx) {
	let o;
	try {
		o = JSON.parse(line);
	} catch {
		return;
	}
	const createdAt = typeof o.created_at === "string" ? o.created_at : "";
	const type = typeof o.type === "string" ? o.type : "";
	const errorCode = typeof o.error_code === "number" || typeof o.error_code === "string" ? String(o.error_code) : "";
	const errorText = typeof o.error === "string" ? o.error : typeof o.content === "string" && type === "ERROR_MESSAGE" ? o.content : "";
	const is429 = errorCode === "429" || LIMIT_REGEX.test(errorText);
	if (type === "ERROR_MESSAGE" && is429 && ctx.limits) {
		const prev = ctx.limits.get(ctx.sessionId);
		if (!prev || prev.ts <= createdAt) ctx.limits.set(ctx.sessionId, {
			ts: createdAt,
			resetsAt: 0,
			type: "agy-429"
		});
	} else if (ctx.limits && createdAt && !NOISE_TYPES.has(type)) {
		const prev = ctx.limits.get(ctx.sessionId);
		if (prev && prev.ts < createdAt) ctx.limits.delete(ctx.sessionId);
	}
	const extracted = extractAgyUsage(o);
	if (extracted?.usage) ctx.pendingUsage = aggregateTokens([{ usage: ctx.pendingUsage }, { usage: extracted.usage }]);
	if (extracted?.model) ctx.lastModel = extracted.model;
	const toolCalls = Array.isArray(o.tool_calls) ? o.tool_calls : null;
	if (!toolCalls || toolCalls.length === 0) return;
	for (let idx = 0; idx < toolCalls.length; idx++) {
		const tc = toolCalls[idx];
		if (!tc || typeof tc !== "object") continue;
		const name = typeof tc.name === "string" ? tc.name : "";
		const args = tc.args && typeof tc.args === "object" ? tc.args : {};
		for (const repoNorm of ctx.repoNorms) if (!ctx.matched.has(repoNorm) && checkRepoPath(args, repoNorm)) ctx.matched.add(repoNorm);
		const stepIndex = o.step_index !== void 0 ? String(o.step_index) : String(idx);
		const id = `agy-${ctx.sessionId}-${stepIndex}-${idx}`;
		const exitCode = typeof o.exit_code === "number" ? o.exit_code : null;
		const status = typeof o.status === "string" ? o.status : "";
		const isError = exitCode !== null ? exitCode !== 0 : status === "ERROR" ? true : null;
		const whyText = typeof o.thinking === "string" ? o.thinking : typeof o.content === "string" ? o.content : "";
		const usage = ctx.pendingUsage;
		ctx.pendingUsage = void 0;
		const ev = {
			id,
			sessionId: ctx.sessionId,
			ts: createdAt,
			agent: "agy",
			tool: name,
			...describeInput(name, args),
			isError,
			why: maskWhy(whyText),
			...usage ? { usage } : {},
			...ctx.lastModel ? { model: ctx.lastModel } : {}
		};
		ctx.out.push(ev);
	}
}
//#endregion
//#region server/transcriptAgy.ts
function agyTranscriptDirs() {
	if (process.env.OBSERVATORY_AGY_DIR) return [process.env.OBSERVATORY_AGY_DIR];
	return [path.join(os.homedir(), ".gemini", "antigravity", "brain"), path.join(os.homedir(), ".gemini", "antigravity-ide", "brain")].filter((d) => fs.existsSync(d));
}
var RECENT_DAYS$1 = 7;
var DAY_MS$2 = 864e5;
var CHUNK$1 = 1048576;
var AgyPool = class {
	limits = /* @__PURE__ */ new Map();
	windowDays = RECENT_DAYS$1;
	version = 0;
	dirs;
	repoRoots;
	now;
	files = /* @__PURE__ */ new Map();
	loggedErrors = /* @__PURE__ */ new Set();
	knownRepos = /* @__PURE__ */ new Set();
	pendingFiles = null;
	nextFile = 0;
	constructor(dirs, repoRoots, now = Date.now, windowDays) {
		this.dirs = dirs;
		this.repoRoots = repoRoots;
		this.now = now;
		if (windowDays !== void 0) this.windowDays = windowDays;
	}
	setWindowDays(days) {
		if (this.windowDays !== null && (days === null || days > this.windowDays)) {
			this.windowDays = days;
			this.version++;
		}
	}
	refresh() {
		this.refreshStep(Infinity);
	}
	refreshStep(deadline) {
		if (!this.pendingFiles) {
			const repos = new Set(this.repoRoots().map(agyRepoNorm));
			if (this.knownRepos.size > 0 && [...repos].some((repo) => !this.knownRepos.has(repo))) {
				this.files.clear();
				this.limits.clear();
				this.version++;
			}
			this.knownRepos = repos;
			this.pendingFiles = this.list();
			this.nextFile = 0;
		}
		try {
			while (this.nextFile < this.pendingFiles.length) {
				if (this.read(this.pendingFiles[this.nextFile], deadline)) return false;
				this.nextFile++;
				if (this.nextFile < this.pendingFiles.length && performance.now() >= deadline) return false;
			}
		} catch (error) {
			this.pendingFiles = null;
			throw error;
		}
		this.pendingFiles = null;
		return true;
	}
	list() {
		const out = [];
		for (const d of this.dirs) {
			if (!d || !fs.existsSync(d)) continue;
			try {
				for (const e of fs.readdirSync(d, { withFileTypes: true })) {
					if (!e.isDirectory()) continue;
					const logFile = path.join(d, e.name, ".system_generated", "logs", "transcript.jsonl");
					if (fs.existsSync(logFile)) out.push(logFile);
				}
			} catch {}
		}
		return out;
	}
	read(file, deadline) {
		let fd;
		try {
			const stat = fs.statSync(file);
			let st = this.files.get(file);
			if (!st) {
				if (this.windowDays !== null && this.now() - stat.mtimeMs > this.windowDays * DAY_MS$2) return false;
				const parts = normPath(file).split("/");
				const brainIdx = parts.lastIndexOf("brain");
				const sessionId = brainIdx >= 0 && parts[brainIdx + 1] ? parts[brainIdx + 1] : path.basename(path.dirname(path.dirname(path.dirname(file))));
				st = {
					offset: 0,
					rest: "",
					decoder: new StringDecoder("utf8"),
					ctx: {
						sessionId,
						repoNorms: [...this.knownRepos],
						matched: /* @__PURE__ */ new Set(),
						out: [],
						limits: this.limits
					},
					mtimeMs: stat.mtimeMs
				};
				this.files.set(file, st);
			}
			st.mtimeMs = stat.mtimeMs;
			if (stat.size <= st.offset) return false;
			fd = fs.openSync(file, "r");
			const buf = Buffer.alloc(Math.min(CHUNK$1, stat.size - st.offset));
			let stopped = false;
			while (st.offset < stat.size) {
				const n = fs.readSync(fd, buf, 0, Math.min(buf.length, stat.size - st.offset), st.offset);
				if (n <= 0) break;
				st.offset += n;
				this.version++;
				const lines = (st.rest + st.decoder.write(buf.subarray(0, n))).split("\n");
				st.rest = lines.pop() ?? "";
				for (const l of lines) if (l) parseAgyLine(l, st.ctx);
				if (performance.now() >= deadline && st.offset < stat.size) {
					stopped = true;
					break;
				}
			}
			return stopped;
		} catch (error) {
			if (error.code === "ENOENT") this.files.delete(file);
			else if (!this.loggedErrors.has(file)) {
				this.loggedErrors.add(file);
				console.error(`Failed to read transcript ${file}:`, error);
			}
			return false;
		} finally {
			if (fd !== void 0) try {
				fs.closeSync(fd);
			} catch {}
		}
	}
};
var AgyTranscriptIndex = class {
	writes = /* @__PURE__ */ new Map();
	writesVersion = -1;
	pool;
	repoNorm;
	cachedVersion = -1;
	cachedEvents = [];
	constructor(dir, repoRoot, now = Date.now, windowDays, pool) {
		this.repoNorm = agyRepoNorm(repoRoot);
		this.pool = pool ?? new AgyPool(Array.isArray(dir) ? dir : [dir], () => [repoRoot], now, windowDays);
	}
	get events() {
		if (this.cachedVersion !== this.pool.version) {
			this.cachedEvents = [...this.pool.files.values()].filter((st) => st.ctx.matched.has(this.repoNorm)).flatMap((st) => st.ctx.out).sort((a, b) => a.ts.localeCompare(b.ts));
			this.cachedVersion = this.pool.version;
		}
		return this.cachedEvents;
	}
	get limits() {
		return this.pool.limits;
	}
	get lastWrite() {
		if (this.writesVersion !== this.pool.version) {
			this.writes.clear();
			for (const st of this.pool.files.values()) if (st.ctx.matched.has(this.repoNorm)) {
				const sid = st.ctx.sessionId;
				this.writes.set(sid, Math.max(this.writes.get(sid) ?? 0, st.mtimeMs));
			}
			this.writesVersion = this.pool.version;
		}
		return this.writes;
	}
	get version() {
		return this.pool.version;
	}
	get windowDays() {
		return this.pool.windowDays;
	}
	setWindowDays(days) {
		this.pool.setWindowDays(days);
	}
	refresh() {
		this.refreshStep(Infinity);
	}
	refreshStep(deadline) {
		return this.pool.refreshStep(deadline);
	}
};
//#endregion
//#region server/adapters/codexAdapter.ts
var responseStart = /* @__PURE__ */ new WeakMap();
var obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var str = (v) => typeof v === "string" ? v : "";
var count = (v) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
var path$1 = (v) => normPath(v).toLowerCase().replace(/\/+$/, "");
function extractCodexUsage(raw) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const o = obj(raw);
	if (typeof o.input_tokens !== "number" && typeof o.output_tokens !== "number") return null;
	const cacheReadTokens = count(o.cached_input_tokens);
	const inputTokens = Math.max(0, count(o.input_tokens) - cacheReadTokens);
	const cacheCreationTokens = count(o.cache_write_input_tokens);
	const outputTokens = count(o.output_tokens);
	return { usage: {
		inputTokens,
		cacheReadTokens,
		cacheCreationTokens,
		outputTokens,
		totalTokens: inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens
	} };
}
function command(input) {
	const match = input.match(/\bcmd\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/s);
	if (!match) return "";
	try {
		return JSON.parse(match[1]);
	} catch {
		return match[1].slice(1, -1);
	}
}
function patchFiles(input) {
	const files = [];
	for (const match of input.matchAll(/\*\*\* (Add|Update|Delete) File: |\*\*\* Move to: /g)) {
		let file_path = "";
		for (let i = match.index + match[0].length; i < input.length; i++) {
			const ch = input[i];
			if (ch === "\n" || ch === "\r" || ch === "\"" || ch === "'" || ch === "`") break;
			if (ch === "\\") {
				if (input[i + 1] === "n") break;
				if (input[i + 1] === "\\") {
					file_path += "\\";
					i++;
					continue;
				}
			}
			file_path += ch;
		}
		if (file_path) files.push({
			tool: match[1] === "Add" ? "Write" : "Edit",
			file_path
		});
	}
	return files;
}
function metadata(args) {
	return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, typeof value === "string" ? `<${value.length} ký tự>` : Array.isArray(value) ? `<mảng ${value.length} phần tử>` : value && typeof value === "object" ? "<object>" : value]));
}
function argumentsOf(raw) {
	if (typeof raw !== "string") return obj(raw);
	try {
		return obj(JSON.parse(raw));
	} catch {
		return {};
	}
}
function outputText(raw) {
	if (typeof raw === "string") return [raw];
	if (Array.isArray(raw)) return raw.filter((part) => part?.type === "input_text" && typeof part.text === "string").map((part) => part.text);
	return [];
}
function parseCodexLine(line, ctx) {
	if (ctx.metaSeen && ctx.matched.size === 0) return;
	let o;
	try {
		o = obj(JSON.parse(line));
	} catch {
		ctx.parseErrors++;
		return;
	}
	const payload = obj(o.payload);
	const ts = str(o.timestamp);
	if (o.type === "session_meta") {
		if (ctx.metaSeen) return;
		ctx.metaSeen = true;
		if (typeof payload.id === "string") ctx.sessionId = payload.id;
		const cwd = path$1(str(payload.cwd));
		for (const root of ctx.repoRoots) {
			const repo = path$1(root);
			if (repo && (cwd === repo || cwd.startsWith(`${repo}/`))) ctx.matched.add(root);
		}
		ctx.agent = Object.hasOwn(obj(payload.source), "subagent") ? "codex-subagent" : "codex";
		return;
	}
	if (o.type === "turn_context") {
		if (typeof payload.model === "string") ctx.model = payload.model;
		return;
	}
	if (o.type === "token_usage_record") {
		const usage = extractCodexUsage(payload.usage)?.usage;
		if (!usage) return;
		const rawUsage = obj(payload.usage);
		const input = count(rawUsage.input_tokens);
		const cached = count(rawUsage.cached_input_tokens);
		if (!ctx.sessionSeen && ctx.agent === "codex") {
			ctx.sessionEvents.push({
				sessionId: ctx.sessionId,
				ts,
				agent: ctx.agent,
				kind: "BASE",
				tokens: input,
				parts: {
					input: Math.max(0, input - cached),
					cacheCreation: count(rawUsage.cache_write_input_tokens),
					cacheRead: cached
				},
				...ctx.model ? { model: ctx.model } : {},
				detail: "Context đầu phiên"
			});
			ctx.sessionSeen = true;
		}
		ctx.sessionEvents.push({
			sessionId: ctx.sessionId,
			ts,
			agent: ctx.agent,
			kind: "CTX",
			tokens: input,
			...ctx.window ? { window: ctx.window } : {},
			...ctx.model ? { model: ctx.model } : {},
			detail: "Context"
		});
		const start = responseStart.get(ctx) ?? 0;
		if (ctx.out.length > start) {
			const first = ctx.out[start];
			first.usage = aggregateTokens([{ usage: first.usage }, { usage }]);
		} else ctx.pendingUsage = aggregateTokens([{ usage: ctx.pendingUsage }, { usage }]);
		responseStart.set(ctx, ctx.out.length);
		ctx.lastText = "";
		return;
	}
	if (o.type === "compacted") {
		const tokens = obj(obj(payload.latest_token_usage_record).usage).input_tokens;
		ctx.sessionEvents.push({
			sessionId: ctx.sessionId,
			ts,
			agent: ctx.agent,
			kind: "COMPACT",
			...typeof tokens === "number" ? { tokens } : {},
			detail: "Compaction"
		});
		return;
	}
	if (o.type === "event_msg") {
		if (payload.type === "token_count") {
			const window = obj(payload.info).model_context_window;
			if (typeof window === "number" && Number.isFinite(window) && window > 0) ctx.window = window;
			const limits = obj(payload.rate_limits);
			const reached = limits.rate_limit_reached_type;
			const windows = ["primary", "secondary"].map((type) => ({
				type,
				data: obj(limits[type])
			})).filter(({ data }) => typeof data.resets_at === "number" && Number.isFinite(data.resets_at));
			let touched = windows.filter(({ data }) => count(data.used_percent) >= 100);
			if (touched.length === 0 && reached != null) {
				touched = windows.filter(({ type }) => type === reached);
				if (touched.length === 0) touched = windows.sort((a, b) => count(b.data.used_percent) - count(a.data.used_percent)).slice(0, 1);
			}
			touched.sort((a, b) => count(b.data.resets_at) - count(a.data.resets_at));
			if (touched[0] && ctx.limits) ctx.limits.set(ctx.sessionId, {
				ts,
				resetsAt: count(touched[0].data.resets_at) * 1e3,
				type: `codex-${touched[0].type}`
			});
		}
		return;
	}
	if (o.type !== "response_item") return;
	const itemType = str(payload.type);
	if (itemType === "message" && payload.role === "assistant") {
		ctx.lastText = (Array.isArray(payload.content) ? payload.content : []).filter((part) => part?.type === "output_text" && typeof part.text === "string").map((part) => part.text).join(" ");
		return;
	}
	if (itemType === "custom_tool_call_output" || itemType === "function_call_output") {
		const ev = ctx.byCallId.get(str(payload.call_id));
		if (!ev) return;
		const parts = outputText(payload.output);
		ev.resultChars = parts.reduce((sum, part) => sum + part.length, 0);
		ev.isError = parts.some((part) => part.startsWith("Script failed") || part.includes("exec_command failed"));
		return;
	}
	if (itemType !== "custom_tool_call" && itemType !== "function_call") return;
	const name = str(payload.name);
	const input = str(payload.input);
	const calls = [];
	if (itemType === "custom_tool_call" && name === "exec") {
		if (input.includes("tools.apply_patch")) for (const file of patchFiles(input)) calls.push({
			tool: file.tool,
			args: { file_path: file.file_path },
			patch: true
		});
		if (input.includes("tools.exec_command")) calls.push({
			tool: "Bash",
			args: { command: command(input.slice(input.indexOf("tools.exec_command"))) }
		});
		if (calls.length === 0) {
			const fallback = input.match(/tools\.(\w+)\s*\(/)?.[1] ?? "exec";
			calls.push({
				tool: fallback,
				args: {},
				plain: true
			});
		}
	} else {
		const args = argumentsOf(payload.arguments);
		calls.push({
			tool: name === "spawn_agent" ? "Agent" : name,
			args: name === "spawn_agent" ? {
				description: args.task_name,
				subagent_type: args.agent_type,
				prompt: maskWhy(str(args.message))
			} : metadata(args)
		});
	}
	const callId = str(payload.call_id);
	for (const [index, call] of calls.entries()) {
		const described = call.plain ? {
			target: call.tool,
			input: call.tool
		} : call.patch ? describeInput("Edit", call.args) : describeInput(call.tool, call.args);
		if (itemType === "function_call" && call.tool !== "Agent") described.target = call.tool;
		const ev = {
			id: `codex-${ctx.sessionId}-${callId}${call.patch ? `-p${index + 1}` : ""}`,
			sessionId: ctx.sessionId,
			ts,
			agent: ctx.agent,
			tool: call.tool,
			...described,
			isError: null,
			why: maskWhy(ctx.lastText),
			...ctx.model ? { model: ctx.model } : {},
			...index === 0 && ctx.pendingUsage ? { usage: ctx.pendingUsage } : {}
		};
		ctx.out.push(ev);
		if (index === 0) ctx.byCallId.set(callId, ev);
	}
	ctx.pendingUsage = void 0;
}
//#endregion
//#region server/transcriptCodex.ts
var RECENT_DAYS = 30;
var DAY_MS$1 = 864e5;
var CHUNK = 1048576;
function codexSessionDirs() {
	if (process.env.OBSERVATORY_CODEX_DIR) return [process.env.OBSERVATORY_CODEX_DIR];
	const dir = path.join(os.homedir(), ".codex", "sessions");
	return fs.existsSync(dir) ? [dir] : [];
}
var CodexPool = class {
	limits = /* @__PURE__ */ new Map();
	windowDays = RECENT_DAYS;
	version = 0;
	roots;
	repoRoots;
	now;
	files = /* @__PURE__ */ new Map();
	loggedErrors = /* @__PURE__ */ new Set();
	oldFiles = /* @__PURE__ */ new Set();
	knownRepos = /* @__PURE__ */ new Set();
	pendingFiles = null;
	nextFile = 0;
	constructor(dirs, repoRoots, now = Date.now, windowDays) {
		this.roots = dirs;
		this.repoRoots = repoRoots;
		this.now = now;
		if (windowDays !== void 0) this.windowDays = windowDays;
	}
	setWindowDays(days) {
		if (this.windowDays !== null && (days === null || days > this.windowDays)) {
			this.windowDays = days;
			this.oldFiles.clear();
			this.version++;
		}
	}
	refresh() {
		this.refreshStep(Infinity);
	}
	refreshStep(deadline) {
		if (!this.pendingFiles) {
			const repos = new Set(this.repoRoots().map((r) => r.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "")));
			const added = [...repos].filter((repo) => !this.knownRepos.has(repo));
			if (added.length > 0) {
				let reset = false;
				for (const [file, st] of this.files) if (st.ctx.matched.size === 0 || added.some((n) => [...st.ctx.matched].some((m) => m === n || n.startsWith(`${m}/`) || m.startsWith(`${n}/`)))) {
					this.files.delete(file);
					reset = true;
				}
				if (reset) this.version++;
			}
			this.knownRepos = repos;
			this.pendingFiles = this.list();
			this.nextFile = 0;
		}
		try {
			while (this.nextFile < this.pendingFiles.length) {
				if (this.read(this.pendingFiles[this.nextFile], deadline)) return false;
				this.nextFile++;
				if (this.nextFile < this.pendingFiles.length && performance.now() >= deadline) return false;
			}
		} catch (error) {
			this.pendingFiles = null;
			throw error;
		}
		this.pendingFiles = null;
		return true;
	}
	list() {
		const out = [];
		const visit = (dir) => {
			try {
				for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
					const name = path.join(dir, entry.name);
					if (entry.isDirectory()) visit(name);
					else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) out.push(name);
				}
			} catch {}
		};
		for (const root of this.roots) if (root) visit(root);
		return out;
	}
	read(file, deadline) {
		if (this.oldFiles.has(file)) return false;
		const existing = this.files.get(file);
		if (existing?.ctx.metaSeen && existing.ctx.matched.size === 0) return false;
		let fd;
		try {
			const stat = fs.statSync(file);
			let st = this.files.get(file);
			if (!st) {
				if (this.windowDays !== null && this.now() - stat.mtimeMs > this.windowDays * DAY_MS$1) {
					this.oldFiles.add(file);
					return false;
				}
				st = {
					offset: 0,
					rest: "",
					decoder: new StringDecoder("utf8"),
					mtimeMs: stat.mtimeMs,
					ctx: {
						sessionId: path.basename(file, ".jsonl"),
						repoRoots: [...this.knownRepos],
						matched: /* @__PURE__ */ new Set(),
						agent: "codex",
						out: [],
						sessionEvents: [],
						limits: this.limits,
						byCallId: /* @__PURE__ */ new Map(),
						lastText: "",
						parseErrors: 0,
						sessionSeen: false,
						metaSeen: false
					}
				};
				this.files.set(file, st);
			}
			st.mtimeMs = stat.mtimeMs;
			if (stat.size <= st.offset) return false;
			fd = fs.openSync(file, "r");
			const buf = Buffer.alloc(Math.min(CHUNK, stat.size - st.offset));
			let stopped = false;
			while (st.offset < stat.size) {
				const n = fs.readSync(fd, buf, 0, Math.min(buf.length, stat.size - st.offset), st.offset);
				if (n <= 0) break;
				st.offset += n;
				this.version++;
				const lines = (st.rest + st.decoder.write(buf.subarray(0, n))).split("\n");
				st.rest = lines.pop() ?? "";
				for (const line of lines) if (line) parseCodexLine(line, st.ctx);
				if (performance.now() >= deadline && st.offset < stat.size) {
					stopped = true;
					break;
				}
			}
			return stopped;
		} catch (error) {
			if (error.code === "ENOENT") this.files.delete(file);
			else if (!this.loggedErrors.has(file)) {
				this.loggedErrors.add(file);
				console.error(`Failed to read transcript ${file}:`, error);
			}
			return false;
		} finally {
			if (fd !== void 0) try {
				fs.closeSync(fd);
			} catch {}
		}
	}
};
var CodexTranscriptIndex = class {
	writes = /* @__PURE__ */ new Map();
	writesVersion = -1;
	pool;
	repoNorm;
	constructor(dir, repoRoot, now = Date.now, windowDays, pool) {
		this.repoNorm = repoRoot.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
		this.pool = pool ?? new CodexPool(Array.isArray(dir) ? dir : [dir], () => [repoRoot], now, windowDays);
	}
	get events() {
		return [...this.pool.files.values()].filter((s) => s.ctx.matched.has(this.repoNorm)).flatMap((s) => s.ctx.out).sort((a, b) => a.ts.localeCompare(b.ts));
	}
	get sessionEvents() {
		return [...this.pool.files.values()].filter((s) => s.ctx.matched.has(this.repoNorm)).flatMap((s) => s.ctx.sessionEvents);
	}
	get limits() {
		return this.pool.limits;
	}
	get lastWrite() {
		if (this.writesVersion !== this.pool.version) {
			this.writes.clear();
			for (const st of this.pool.files.values()) if (st.ctx.matched.has(this.repoNorm)) {
				const sid = st.ctx.sessionId;
				this.writes.set(sid, Math.max(this.writes.get(sid) ?? 0, st.mtimeMs));
			}
			this.writesVersion = this.pool.version;
		}
		return this.writes;
	}
	get version() {
		return this.pool.version;
	}
	get windowDays() {
		return this.pool.windowDays;
	}
	setWindowDays(days) {
		this.pool.setWindowDays(days);
	}
	dirs() {
		return this.pool.roots;
	}
	stats() {
		const states = [...this.pool.files.values()];
		return {
			files: states.length,
			matched: states.filter((s) => s.ctx.matched.has(this.repoNorm)).length,
			parseErrors: states.reduce((sum, s) => sum + s.ctx.parseErrors, 0)
		};
	}
	refresh() {
		this.refreshStep(Infinity);
	}
	refreshStep(deadline) {
		return this.pool.refreshStep(deadline);
	}
};
//#endregion
//#region server/adapters/registry.ts
function sourcesOf(ctx) {
	const source = (id, label, index) => ({
		id,
		label,
		key: index instanceof Object && "pool" in index ? index.pool : index,
		refreshStep: (deadline) => index.refreshStep(deadline),
		refresh: () => index.refresh(),
		version: () => index.version,
		events: () => index.events ?? [],
		sessionEvents: () => "sessionEvents" in index ? index.sessionEvents ?? [] : [],
		limits: () => index.limits
	});
	return [
		source("claude", "Claude", ctx.index),
		...ctx.agyIndex ? [source("agy", "Antigravity", ctx.agyIndex)] : [],
		...ctx.codexIndex ? [source("codex", "Codex", ctx.codexIndex)] : []
	];
}
function adapterStatuses(ctx) {
	const sources = new Map(sourcesOf(ctx).map((source) => [source.id, source]));
	const dirs = {
		claude: [transcriptDir(ctx.repoRoot)],
		agy: agyTranscriptDirs(),
		codex: codexSessionDirs()
	};
	return [
		"claude",
		"agy",
		"codex"
	].map((id) => {
		const source = sources.get(id);
		const events = source?.events() ?? [];
		const present = !!source && dirs[id].some((dir) => fs.existsSync(dir));
		return {
			id,
			label: source?.label ?? {
				claude: "Claude",
				agy: "Antigravity",
				codex: "Codex"
			}[id],
			dirs: dirs[id],
			state: !present ? "MISSING" : events.length ? "OK" : "EMPTY",
			sessions: new Set(events.map((event) => event.sessionId)).size,
			events: events.length,
			lastEventAt: events.reduce((last, event) => !last || event.ts > last ? event.ts : last, null),
			parseErrors: id === "codex" ? ctx.codexIndex?.stats().parseErrors ?? null : null
		};
	});
}
//#endregion
//#region server/overlap.ts
var cleanPath = (p) => normPath(p.replace(/`/g, "").trim()).replace(/^\.\//, "");
function fileOverlaps(cur, others) {
	const out = [];
	const curDoing = cur.tasks.filter((t) => t.status === "DOING");
	for (const t of curDoing) {
		const tFiles = t.files.map(cleanPath).filter(Boolean);
		if (!tFiles.length) continue;
		let found = false;
		for (const o of curDoing) {
			if (o.id === t.id) continue;
			const oFiles = o.files.map(cleanPath).filter(Boolean);
			const shared = tFiles.filter((f) => oFiles.includes(f));
			if (shared.length > 0) {
				const extra = shared.length > 1 ? `, +${shared.length - 1}` : "";
				out.push({
					taskId: t.id,
					kind: "FILE_OVERLAP",
					severity: "WARN",
					message: `${t.id} và ${o.id} cùng sửa ${shared[0]}${extra}`
				});
				found = true;
				break;
			}
		}
		if (found) continue;
		for (const om of others) {
			const otherDoing = om.tasks.filter((ot) => ot.status === "DOING");
			for (const ot of otherDoing) {
				const otFiles = ot.files.map(cleanPath).filter(Boolean);
				const shared = tFiles.filter((f) => otFiles.includes(f));
				if (shared.length > 0) {
					const extra = shared.length > 1 ? `, +${shared.length - 1}` : "";
					out.push({
						taskId: t.id,
						kind: "FILE_OVERLAP",
						severity: "WARN",
						message: `${t.id} và ${om.missionId}/${ot.id} cùng sửa ${shared[0]}${extra}`
					});
					found = true;
					break;
				}
			}
			if (found) break;
		}
	}
	return out;
}
//#endregion
//#region server/missions.ts
var ARTIFACT_RE = /docs\/artifact\/([\w.-]+)/g;
var WRITE_TOOLS = [
	"Write",
	"Edit",
	"NotebookEdit",
	"write_to_file",
	"replace_file_content"
];
var SHELL_TOOLS = [
	"Bash",
	"PowerShell",
	"run_command"
];
var SHELL_WRITE_RE = /(?:^|[\s;&|(])(?:tee|mv|cp|rm|mkdir|touch|sed\s+-\w*i|git\s+(?:add|mv|rm)|Set-Content|Add-Content|Out-File|New-Item)(?![\w-])|(?<![\d&])>>?(?![&>])\s*(?!\/dev\/null)\S|writeFileSync/i;
var ACTIVITY_MAX = 300;
var lite = ({ input: _input, ...rest }) => rest;
var read$2 = (p) => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
var DOC_NAMES = [
	"intent.md",
	"spec.md",
	"plan.md",
	"progress.md",
	"research.md",
	"decision.md",
	"review.md"
];
function tableName(dir) {
	return parsePlan(read$2(path.join(dir, "progress.md"))).cols !== null ? "progress.md" : "plan.md";
}
var DOC_EXT = /\.(md|sql|txt)$/;
var SEG = /^[\w.-]+$/;
var MAX_DOC_BYTES$1 = 2097152;
var DOC_DIRS = [
	"rollback",
	"report",
	"nguon"
];
function listDocs(dir) {
	const ok = (n) => DOC_EXT.test(n) && SEG.test(n);
	const files = (d, prefix) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile() && ok(e.name)).map((e) => prefix + e.name).sort((x, y) => x < y ? -1 : x > y ? 1 : 0);
	const rank = (n) => DOC_NAMES.includes(n) ? DOC_NAMES.indexOf(n) : DOC_NAMES.length;
	const all = files(dir, "").sort((x, y) => rank(x) - rank(y));
	for (const sub of DOC_DIRS) try {
		if (!fs.lstatSync(path.join(dir, sub)).isSymbolicLink()) all.push(...files(path.join(dir, sub), sub + "/"));
	} catch {}
	return all;
}
function readDoc(ctx, id, name) {
	if (!listFolders(ctx.artifactRoot).includes(id)) return null;
	const dir = path.join(ctx.artifactRoot, id);
	if (!listDocs(dir).includes(name)) return null;
	const file = path.join(dir, name);
	return fs.statSync(file).size > MAX_DOC_BYTES$1 ? null : fs.readFileSync(file, "utf8");
}
function listFolders(artifactRoot) {
	return fs.readdirSync(artifactRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}
function linkSessions(events, ids = []) {
	const map = /* @__PURE__ */ new Map();
	const link = (id, sid) => {
		let s = map.get(id);
		if (!s) map.set(id, s = /* @__PURE__ */ new Set());
		s.add(sid);
	};
	const maskedRe = ids.filter((id) => maskDigits(id) !== id).map((id) => [id, new RegExp(`docs/artifact/${maskDigits(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`, "g")]);
	const knownIds = new Set(ids);
	const artifactIds = (text) => {
		if (!text.includes("docs/artifact/")) return [];
		return [...[...text.matchAll(ARTIFACT_RE)].map((m) => m[1]), ...maskedRe.flatMap(([id, re]) => [...text.matchAll(re)].map(() => id))];
	};
	const mentions = /* @__PURE__ */ new Map();
	for (const ev of events) {
		const shell = SHELL_TOOLS.includes(ev.tool);
		if (!shell && !WRITE_TOOLS.includes(ev.tool)) continue;
		const text = normPath(`${ev.target} ${ev.input}`).replace(/\/{2,}/g, "/");
		const writeText = shell ? text : normPath(ev.target);
		const writeIds = !shell || SHELL_WRITE_RE.test(`${ev.target} ${ev.input}`) ? artifactIds(writeText) : [];
		for (const id of writeIds) link(id, ev.sessionId);
		if (ev.agent === "codex" || ev.agent === "codex-subagent") {
			let counts = mentions.get(ev.sessionId);
			if (!counts) mentions.set(ev.sessionId, counts = /* @__PURE__ */ new Map());
			const inputText = normPath(ev.input).replace(/\/{2,}/g, "/");
			for (const id of inputText === writeText ? writeIds : artifactIds(inputText)) {
				if (ids.length && !knownIds.has(id)) continue;
				counts.set(id, (counts.get(id) ?? 0) + 1);
			}
		}
	}
	for (const [sid, counts] of mentions) {
		const max = Math.max(0, ...counts.values());
		for (const [id, count] of counts) if (count === max) link(id, sid);
	}
	return map;
}
var gitCache = /* @__PURE__ */ new Map();
function dateFromName(id) {
	const m = id.match(/^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2})(?=-))?/);
	return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00` : null;
}
var HEAD_CHECK_MS = 5e3;
var emptyHistory = () => ({
	commits: /* @__PURE__ */ new Map(),
	authors: /* @__PURE__ */ new Map()
});
var folderCache = /* @__PURE__ */ new Map();
var boardWorkCache = /* @__PURE__ */ new Map();
var repoAuthorCache = /* @__PURE__ */ new Map();
function parseFolderHistory(log) {
	const history = emptyHistory();
	let at = "";
	let author = "";
	for (const line of log.split(/\r?\n/)) {
		if (line.startsWith("__C__")) {
			[at, author] = line.slice(5).split("\0");
			continue;
		}
		const match = line.match(/^[A-Z]\tdocs\/artifact\/([^/]+)\/(.+)$/);
		if (!match || !at) continue;
		const [, id, name] = match;
		if (!history.commits.has(id)) history.commits.set(id, at);
		if (!line.startsWith("A	") || !DOC_EXT.test(name) || !author?.trim()) continue;
		const origin = history.authors.get(id) ?? {};
		if (name === "plan.md") origin.plan = author;
		if (name === "intent.md") origin.intent = author;
		origin.document = author;
		history.authors.set(id, origin);
	}
	return history;
}
var gitRuns = 0;
function folderCommits(ctx) {
	const nowMs = ctx.now();
	const hit = folderCache.get(ctx.repoRoot);
	if (hit && nowMs - hit.checkedAt < HEAD_CHECK_MS) return hit.history;
	try {
		const head = git(ctx.repoRoot, ["rev-parse", "HEAD"]).trim();
		if (hit && hit.head === head) hit.checkedAt = nowMs;
		else folderCache.set(ctx.repoRoot, {
			head,
			history: parseFolderHistory(git(ctx.repoRoot, [
				"log",
				"--no-renames",
				"--format=__C__%cI%x00%an",
				"--name-status",
				"--",
				"docs/artifact"
			])),
			checkedAt: nowMs
		});
		return folderCache.get(ctx.repoRoot).history;
	} catch {
		const fail = {
			head: "",
			history: emptyHistory(),
			checkedAt: nowMs
		};
		folderCache.set(ctx.repoRoot, fail);
		return fail.history;
	}
}
var git = (repoRoot, args) => {
	gitRuns++;
	return execFileSync("git", [
		"-C",
		repoRoot,
		"-c",
		"core.quotepath=false",
		...args
	], {
		encoding: "utf8",
		maxBuffer: 33554432,
		stdio: [
			"ignore",
			"pipe",
			"ignore"
		]
	});
};
function boardGitFacts(ctx, id) {
	const history = folderCommits(ctx);
	let cached = boardWorkCache.get(ctx.repoRoot);
	if (cached?.history !== history) {
		const ids = /* @__PURE__ */ new Set();
		try {
			const log = git(ctx.repoRoot, [
				"log",
				"--no-renames",
				"--format=%x1e%B%x1f",
				"--name-only"
			]);
			for (const commit of log.split("").slice(1)) {
				const [body, names = ""] = commit.split("");
				if (!names.split(/\r?\n/).some((name) => name.trim() && !name.startsWith("docs/artifact/"))) continue;
				for (const match of body.matchAll(/^Hiện vật: docs\/artifact\/([^/\r\n]+)\/\s*$/gm)) ids.add(match[1]);
			}
		} catch {}
		cached = {
			history,
			ids
		};
		boardWorkCache.set(ctx.repoRoot, cached);
	}
	if (!repoAuthorCache.has(ctx.repoRoot)) try {
		repoAuthorCache.set(ctx.repoRoot, git(ctx.repoRoot, ["config", "user.name"]).trim() || null);
	} catch {
		repoAuthorCache.set(ctx.repoRoot, null);
	}
	const origin = history.authors.get(id);
	return {
		author: origin?.plan ?? origin?.intent ?? origin?.document ?? repoAuthorCache.get(ctx.repoRoot) ?? null,
		workCommitted: cached.ids.has(id)
	};
}
function gitTransitions(repoRoot, planRel, cols) {
	try {
		const key = `${fs.statSync(path.join(repoRoot, planRel)).mtimeMs}:${git(repoRoot, [
			"log",
			"-1",
			"--format=%H",
			"--",
			planRel
		]).trim()}`;
		const ck = `${repoRoot}:${planRel}`;
		const hit = gitCache.get(ck);
		if (hit && hit.key === key) return hit.tr;
		const tr = parseGitLog(git(repoRoot, [
			"log",
			"--reverse",
			"--format=__C__%cI",
			"-p",
			"--unified=0",
			"--",
			planRel
		]), cols);
		gitCache.set(ck, {
			key,
			tr
		});
		return tr;
	} catch {
		return [];
	}
}
var eventsCache = /* @__PURE__ */ new WeakMap();
function allEvents(ctx) {
	const sources = sourcesOf(ctx);
	const now = ctx.now();
	const viewDays = ctx.viewDays === void 0 ? 30 : ctx.viewDays;
	const key = JSON.stringify([
		sources.map((source) => [source.id, source.version()]),
		viewDays,
		Math.floor(now / 864e5)
	]);
	const hit = eventsCache.get(ctx);
	if (hit?.key === key && now <= hit.validUntil) return hit.events;
	const cutoff = viewDays === null ? -Infinity : now - viewDays * 864e5;
	const events = Object.freeze(sources.flatMap((source) => source.events()).filter((event) => viewDays === null || Date.parse(event.ts) >= cutoff).sort((a, b) => a.ts.localeCompare(b.ts)));
	const validUntil = viewDays === null ? Infinity : events.reduce((soonest, event) => Math.min(soonest, Date.parse(event.ts) + viewDays * 864e5), Infinity);
	eventsCache.set(ctx, {
		key,
		events,
		validUntil
	});
	return events;
}
var ASK_FRESH_MS = 864e5;
function summary(ctx, id, linked, history, evs) {
	const dir = path.join(ctx.artifactRoot, id);
	const intent = read$2(path.join(dir, "intent.md"));
	const planOriginData = planOrigin(frontMatter(read$2(path.join(dir, "plan.md"))));
	const origin = {
		...planOrigin(frontMatter(intent)),
		...planOriginData
	};
	const gitAuthor = history.authors.get(id);
	const createdUser = origin.createdUser ?? gitAuthor?.plan ?? gitAuthor?.intent ?? gitAuthor?.document;
	const plan = parsePlan(read$2(path.join(dir, tableName(dir))));
	const { done, total } = progress(plan.tasks);
	const sessions = [...linked.get(id) ?? []];
	const last = Math.max(0, ...sessions.flatMap((s) => [
		ctx.index.lastWrite?.get(s) ?? 0,
		ctx.agyIndex?.lastWrite?.get(s) ?? 0,
		ctx.codexIndex?.lastWrite?.get(s) ?? 0
	]));
	const flags = ["CHỜ-USER", "BLOCKED"].filter((f) => plan.tasks.some((t) => t.status === f));
	return {
		id,
		title: missionTitle(frontMatter(intent), intent, id),
		tracked: plan.cols !== null && total > 0,
		done,
		total,
		flags: [...flags],
		live: last > 0 && ctx.now() - last < 12e4,
		asking: sessions.some((s) => {
			const e = evs.findLast((x) => x.sessionId === s);
			return e?.tool === "AskUserQuestion" && e.isError === null && ctx.now() - Date.parse(e.ts) < ASK_FRESH_MS;
		}),
		...origin,
		...createdUser && {
			createdUser,
			createdSource: origin.createdUser ? "metadata" : "git"
		},
		lastActivity: new Date(last || Date.parse(history.commits.get(id) ?? "") || Date.parse(dateFromName(id) ?? "") || fs.statSync(dir).mtimeMs).toISOString()
	};
}
var missionsCache = /* @__PURE__ */ new WeakMap();
function listMissions(ctx) {
	const evs = allEvents(ctx);
	const folders = listFolders(ctx.artifactRoot);
	const commits = folderCommits(ctx);
	const key = JSON.stringify([folders.map((id) => [id, ...[
		"intent.md",
		"plan.md",
		"progress.md"
	].map((name) => {
		try {
			return fs.statSync(path.join(ctx.artifactRoot, id, name)).mtimeMs;
		} catch {
			return null;
		}
	})]), Math.floor(ctx.now() / 1e4)]);
	const hit = missionsCache.get(ctx);
	if (hit?.key === key && hit.events === evs && hit.commits === commits) return hit.missions;
	const linked = linkSessions(evs, folders);
	const rank = (m) => m.flags.length ? 0 : m.live ? 1 : 2;
	const missions = folders.map((id) => summary(ctx, id, linked, commits, evs)).sort((a, b) => rank(a) - rank(b) || (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
	missionsCache.set(ctx, {
		key,
		events: evs,
		commits,
		missions
	});
	return missions;
}
function taskWindowOf(taskId, status, tr, events) {
	const mine = tr.filter((t) => t.taskId === taskId);
	return {
		start: mine.find((t) => t.status === "DOING")?.at ?? events[0]?.ts ?? null,
		end: status === "DONE" || status === "SKIP" ? mine.find((t) => t.status === "DONE" || t.status === "SKIP")?.at ?? null : null
	};
}
var overlapCache = /* @__PURE__ */ new Map();
function overlapTasks(file) {
	let mtimeMs = -1;
	try {
		mtimeMs = fs.statSync(file).mtimeMs;
	} catch {}
	const hit = overlapCache.get(file);
	if (hit && hit.mtimeMs === mtimeMs) return hit.tasks;
	const tasks = parsePlan(read$2(file)).tasks.map((t) => ({
		id: t.id,
		status: t.status,
		files: t.files
	}));
	overlapCache.set(file, {
		mtimeMs,
		tasks
	});
	return tasks;
}
function missionDetail(ctx, id) {
	if (!listFolders(ctx.artifactRoot).includes(id)) return null;
	const allEvs = allEvents(ctx);
	const linked = linkSessions(allEvs, listFolders(ctx.artifactRoot));
	const base = summary(ctx, id, linked, folderCommits(ctx), allEvs);
	const dir = path.join(ctx.artifactRoot, id);
	const planMd = read$2(path.join(dir, "plan.md"));
	const table = tableName(dir);
	const plan = table === "plan.md" ? parsePlan(planMd) : parsePlan(read$2(path.join(dir, table)));
	const docs = listDocs(dir);
	const sessions = [...linked.get(id) ?? []];
	const events = allEvs.filter((e) => sessions.includes(e.sessionId)).sort((a, b) => a.ts.localeCompare(b.ts));
	const sessionEvents = sourcesOf(ctx).flatMap((source) => source.sessionEvents()).filter((e) => sessions.includes(e.sessionId)).sort((a, b) => a.ts.localeCompare(b.ts));
	const planRel = normPath(path.relative(ctx.repoRoot, path.join(dir, table)));
	const tr = plan.cols ? gitTransitions(ctx.repoRoot, planRel, plan.cols) : [];
	const assigned = assign(plan.tasks, tr, events, new Date(ctx.now()).toISOString());
	const nowMs = ctx.now();
	const avgMs = avgDoneMs(plan.tasks, tr);
	const tasks = plan.tasks.map((t) => {
		const a = assigned.get(t.id);
		const base = {
			...t,
			next: isNext(t, plan.tasks),
			anchor: taskAnchor(planMd, t.id),
			...a
		};
		const taskTokens = aggregateTokens(a.events);
		const taskCost = aggregateCost(a.events);
		const partial = {
			...base,
			agents: agentsOf(a.events, nowMs, LIVE_MS),
			estimate: estimateOf(t, tr, nowMs, avgMs),
			window: taskWindowOf(t.id, t.status, tr, a.events),
			tokens: taskTokens,
			cost: taskCost
		};
		return {
			...partial,
			flow: flowOf(partial, ctx.repoRoot)
		};
	});
	const action = events.at(-1) ?? null;
	const doing = tasks.filter((t) => t.status === "DOING");
	let liveTaskId = null;
	if (base.live && action) liveTaskId = doing.length === 1 ? doing[0].id : doing.find((t) => t.files.some((f) => normPath(action.target).endsWith(normPath(f))))?.id ?? null;
	const verifyEv = [...events].reverse().find(isVerify);
	const limit = limitOf(ctx, sessions, events, nowMs);
	const bl = blockers(tasks);
	const intentFm = frontMatter(read$2(path.join(dir, "intent.md")));
	const risk = parseRisk(intentFm);
	const missionTokens = aggregateTokens(events);
	const missionCost = aggregateCost(events);
	const owned = new Set([...assigned.values()].flatMap((a) => a.events.map((e) => e.id)));
	const owner = /* @__PURE__ */ new Map();
	for (const [tid, a] of assigned) for (const e of a.events) owner.set(e.id, tid);
	const orphans = events.filter((e) => !owned.has(e.id));
	const [orphanTokens, orphanCost] = [aggregateTokens(orphans), aggregateCost(orphans)];
	const unattributed = orphanTokens && orphanCost ? {
		tokens: orphanTokens,
		cost: orphanCost
	} : void 0;
	let contextGauge;
	if (base.live) {
		const liveSessions = new Set(sessions.filter((s) => {
			const lw = Math.max(ctx.index.lastWrite?.get(s) ?? 0, ctx.agyIndex?.lastWrite?.get(s) ?? 0, ctx.codexIndex?.lastWrite?.get(s) ?? 0);
			return lw > 0 && nowMs - lw < 12e4;
		}));
		const latestCtx = sessionEvents.filter((e) => e.kind === "CTX" && (e.agent === "main" || e.agent === "codex" || !e.agent) && liveSessions.has(e.sessionId) && e.tokens !== void 0).sort((a, b) => a.ts.localeCompare(b.ts)).pop();
		if (latestCtx && latestCtx.tokens !== void 0) {
			const { window: win, estimated } = resolveWindow(latestCtx.model, latestCtx.tokens, latestCtx.window);
			const g = gauge(latestCtx.tokens, win);
			contextGauge = {
				sessionId: latestCtx.sessionId,
				model: latestCtx.model ?? null,
				tokens: latestCtx.tokens,
				window: win,
				pct: g.pct,
				level: g.level,
				...estimated ? { estimated: true } : {}
			};
		}
	}
	return {
		...base,
		tokens: missionTokens,
		cost: missionCost,
		unattributed,
		risk,
		artifacts: artifactChecklist(docs, risk),
		warnings: plan.warnings,
		tasks: tasks.map((t) => ({
			...t,
			events: t.events.slice(-20).map(lite)
		})),
		sessions,
		who: base.live && action ? action.agent : null,
		action: action && lite(action),
		liveTaskId,
		review: events.some(isReview),
		verify: verifyEv ? {
			result: verifyEv.isError === null ? "RUNNING" : verifyEv.isError ? "FAIL" : "PASS",
			at: verifyEv.ts
		} : null,
		runtime: runtimeOf(tasks, base.live),
		activeAgents: agentsOf(events, nowMs, LIVE_MS).filter((a) => a.live),
		why: action?.why ?? "",
		eta: (() => {
			const remaining = tasks.filter((t) => t.status !== "DONE" && t.status !== "SKIP").length;
			return {
				avgTaskMs: avgMs,
				remaining,
				etaMs: avgMs === null ? null : avgMs * remaining
			};
		})(),
		evidenceSummary: evidenceSummary(tasks, events),
		docs,
		limit,
		agentRows: agentRows(events, tasks, limit, nowMs, LIVE_MS),
		blockers: bl,
		anomalies: [...anomalies(tasks, bl, limit, nowMs, events, taskBudget(intentFm, risk)), ...fileOverlaps({
			missionId: id,
			tasks: tasks.map((t) => ({
				id: t.id,
				status: t.status,
				files: t.files
			}))
		}, listFolders(ctx.artifactRoot).filter((oid) => oid !== id).map((oid) => {
			const odir = path.join(ctx.artifactRoot, oid);
			return {
				missionId: oid,
				tasks: overlapTasks(path.join(odir, tableName(odir)))
			};
		}))],
		activityCount: Math.min(events.length, ACTIVITY_MAX),
		ready: readyOrder(plan.tasks),
		hints: hints(events, [...allEvs], sessionEvents, owner),
		sessionEvents: sessionEvents.slice(-200),
		...contextGauge ? { context: contextGauge } : {}
	};
}
function missionActivity(ctx, id) {
	if (!listFolders(ctx.artifactRoot).includes(id)) return null;
	const evs = allEvents(ctx);
	const sessions = linkSessions(evs, listFolders(ctx.artifactRoot)).get(id);
	if (!sessions) return [];
	return evs.filter((e) => sessions.has(e.sessionId)).sort((a, b) => a.ts.localeCompare(b.ts)).slice(-300).reverse().map(lite);
}
function eventInput(ctx, id, eventId) {
	if (!listFolders(ctx.artifactRoot).includes(id)) return null;
	const evs = allEvents(ctx);
	const sessions = linkSessions(evs, listFolders(ctx.artifactRoot)).get(id);
	const ev = evs.find((e) => e.id === eventId);
	if (!ev || !sessions?.has(ev.sessionId)) return null;
	return ev.tool === "Agent" ? maskWhy(ev.input) : ev.input;
}
function limitOf(ctx, sessions, events, nowMs) {
	let best = null;
	let unknown = null;
	for (const sid of sessions) {
		const l = sourcesOf(ctx).map((source) => source.limits()?.get(sid)).find(Boolean);
		if (!l) continue;
		if (l.resetsAt > 0 && l.resetsAt <= nowMs) continue;
		if (events.some((e) => e.sessionId === sid && Date.parse(e.ts) > Date.parse(l.ts))) continue;
		if (l.resetsAt === 0) {
			if (l.type !== "agy-429" || nowMs - Date.parse(l.ts) > 72e5) continue;
			unknown ??= {
				resetsAt: "",
				type: l.type,
				sessionId: sid,
				ts: l.ts
			};
			continue;
		}
		if (!best || l.resetsAt > Date.parse(best.resetsAt)) best = {
			resetsAt: new Date(l.resetsAt).toISOString(),
			type: l.type,
			sessionId: sid,
			ts: l.ts
		};
	}
	return best ?? unknown;
}
//#endregion
//#region server/boardModel.ts
var read$1 = (p) => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
function boardCard(ctx, id, gitFacts) {
	const dir = path.join(ctx.artifactRoot, id);
	const cardPath = `docs/artifact/${id}/`;
	const warnings = [];
	const intentPath = path.join(dir, "intent.md");
	const hasIntent = fs.existsSync(intentPath);
	let title = id;
	let risk = null;
	let finalState = null;
	let intentFm = {};
	if (hasIntent) {
		const intentMd = read$1(intentPath);
		intentFm = frontMatter(intentMd);
		title = missionTitle(intentFm, intentMd, id);
		risk = parseRisk(intentFm);
		const parsedFinal = parseFinalState(intentFm);
		finalState = parsedFinal.state;
		if (parsedFinal.warning !== null) warnings.push(parsedFinal.warning);
	} else warnings.push("Thiếu intent.md");
	const preferredFile = tableName(dir);
	const parsedCandidate = parsePlan(read$1(path.join(dir, preferredFile)));
	let taskSource = null;
	let parsedPlan = parsedCandidate;
	if (parsedCandidate.cols !== null) taskSource = preferredFile;
	else {
		taskSource = null;
		parsedPlan = {
			tasks: [],
			warnings: [],
			cols: null
		};
	}
	for (const w of parsedPlan.warnings) warnings.push(w);
	const validTasks = parsedPlan.tasks.filter((t) => t.status !== "?");
	const hasInvalidStatus = parsedPlan.tasks.some((t) => t.status === "?");
	const taskCounts = {
		TODO: 0,
		DOING: 0,
		"CHỜ-USER": 0,
		BLOCKED: 0,
		DONE: 0,
		SKIP: 0
	};
	for (const t of validTasks) if (t.status in taskCounts) taskCounts[t.status]++;
	const doneTasks = taskCounts.DONE;
	const totalTasks = validTasks.length;
	const progressPct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;
	const assignees = Array.from(new Set(validTasks.map((t) => t.who).filter((w) => Boolean(w && w.trim())))).sort();
	const attentionTasks = validTasks.filter((t) => t.status !== "DONE" && t.status !== "SKIP").map((t) => {
		const item = {
			id: t.id,
			title: t.title,
			status: t.status,
			note: t.note
		};
		if (t.who && t.who.trim()) item.who = t.who.trim();
		return item;
	});
	let creator = null;
	const planPath = path.join(dir, "plan.md");
	if (fs.existsSync(planPath)) {
		const origin = planOrigin(frontMatter(read$1(planPath)));
		if (origin.createdUser || origin.createdAgent || origin.createdBy) creator = {
			user: origin.createdUser || void 0,
			agent: origin.createdAgent || void 0,
			by: origin.createdBy || void 0,
			at: origin.createdAt || void 0
		};
	}
	if (!creator && hasIntent) {
		const origin = planOrigin(intentFm);
		if (origin.createdUser || origin.createdAgent || origin.createdBy) creator = {
			user: origin.createdUser || void 0,
			agent: origin.createdAgent || void 0,
			by: origin.createdBy || void 0,
			at: origin.createdAt || void 0
		};
	}
	if (!creator && gitFacts?.author) creator = { user: gitFacts.author };
	let column;
	if (finalState === "archived") column = "Archived";
	else if (finalState === "done") column = "Done";
	else if (hasIntent && taskSource === null && gitFacts?.workCommitted) column = "Review";
	else if (!hasIntent || taskSource === null || parsedPlan.tasks.length === 0 || hasInvalidStatus) column = "Inbox";
	else if (validTasks.length > 0 && validTasks.every((t) => t.status === "DONE" || t.status === "SKIP")) column = "Review";
	else if (validTasks.some((t) => t.status === "CHỜ-USER")) column = "Chờ-user";
	else if (validTasks.some((t) => t.status === "BLOCKED")) column = "Blocked";
	else if (validTasks.some((t) => t.status === "DOING")) column = "Doing";
	else if (validTasks.some((t) => t.status === "TODO")) column = "Ready";
	else column = "Inbox";
	const documents = {
		intent: fs.existsSync(path.join(dir, "intent.md")) ? `docs/artifact/${id}/intent.md` : null,
		spec: fs.existsSync(path.join(dir, "spec.md")) ? `docs/artifact/${id}/spec.md` : null,
		plan: fs.existsSync(path.join(dir, "plan.md")) ? `docs/artifact/${id}/plan.md` : null,
		progress: fs.existsSync(path.join(dir, "progress.md")) ? `docs/artifact/${id}/progress.md` : null,
		research: fs.existsSync(path.join(dir, "research.md")) ? `docs/artifact/${id}/research.md` : null,
		decision: fs.existsSync(path.join(dir, "decision.md")) ? `docs/artifact/${id}/decision.md` : null,
		review: fs.existsSync(path.join(dir, "review.md")) ? `docs/artifact/${id}/review.md` : null
	};
	return {
		id,
		title,
		path: cardPath,
		column,
		risk,
		finalState,
		taskSource,
		taskCounts,
		attentionTasks,
		warnings,
		documents,
		doneTasks,
		totalTasks,
		progressPct,
		assignees,
		creator
	};
}
//#endregion
//#region server/artifactIndex.ts
function getGitInfo(repoRoot) {
	let branch = null;
	let worktree = path.basename(repoRoot);
	try {
		const rawBranch = execFileSync("git", [
			"-C",
			repoRoot,
			"rev-parse",
			"--abbrev-ref",
			"HEAD"
		], {
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim();
		if (rawBranch && rawBranch !== "HEAD") branch = rawBranch;
	} catch {
		branch = null;
	}
	try {
		const topLevel = execFileSync("git", [
			"-C",
			repoRoot,
			"rev-parse",
			"--show-toplevel"
		], {
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).trim();
		if (topLevel) worktree = path.basename(topLevel);
	} catch {
		worktree = path.basename(repoRoot);
	}
	return {
		branch,
		worktree
	};
}
function parseCreatedAt(id) {
	const m = id.match(/^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?(?:-|$)/);
	if (!m) return null;
	return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00`;
}
function stripMarkdown(text) {
	return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_~`#]/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
}
function extractGoalSummary(intentMd) {
	const boldMatch = intentMd.match(/\*\*[^*]*?[Mm]ục tiêu[^*]*?:\*\*\s*([^\r\n]+)/i);
	if (boldMatch) {
		const content = boldMatch[1].trim();
		if (content) {
			const sentenceMatch = content.match(/^(.+?[.!?])(?:\s+|$)/);
			const stripped = stripMarkdown(sentenceMatch ? sentenceMatch[1] : content);
			if (stripped) {
				const masked = maskText(stripped);
				return Array.from(masked).slice(0, 240).join("") || null;
			}
		}
	}
	const headingMatch = intentMd.match(/^##\s+[Mm]ục tiêu\b[^\r\n]*/m);
	if (headingMatch && headingMatch.index !== void 0) {
		const lines = intentMd.slice(headingMatch.index + headingMatch[0].length).split(/\r?\n/);
		const paragraphLines = [];
		let started = false;
		for (const line of lines) {
			const trimmed = line.trim();
			if (!started) {
				if (trimmed.length > 0) {
					if (trimmed.startsWith("#")) break;
					started = true;
					paragraphLines.push(trimmed);
				}
			} else {
				if (trimmed.length === 0 || trimmed.startsWith("#")) break;
				paragraphLines.push(trimmed);
			}
		}
		if (paragraphLines.length > 0) {
			const stripped = stripMarkdown(paragraphLines.join(" "));
			if (stripped) {
				const masked = maskText(stripped);
				return Array.from(masked).slice(0, 240).join("") || null;
			}
		}
	}
	return null;
}
function buildArtifactIndex(repoRoot) {
	const artifactRoot = path.join(repoRoot, "docs", "artifact");
	const gitInfo = getGitInfo(repoRoot);
	const mockCtx = {
		repoRoot,
		artifactRoot,
		index: {
			byId: /* @__PURE__ */ new Map(),
			byPath: /* @__PURE__ */ new Map(),
			errors: []
		},
		now: () => Date.now()
	};
	let entries = [];
	try {
		entries = fs.readdirSync(artifactRoot, { withFileTypes: true });
	} catch {
		entries = [];
	}
	const folderNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
	const missions = [];
	for (const id of folderNames) {
		const dir = path.join(artifactRoot, id);
		const intentPath = path.join(dir, "intent.md");
		if (!fs.existsSync(intentPath)) continue;
		const card = boardCard(mockCtx, id);
		if (card.finalState === "done" || card.finalState === "archived") continue;
		let intentMd = "";
		try {
			intentMd = fs.readFileSync(intentPath, "utf8");
		} catch {
			intentMd = "";
		}
		const goalSummary = extractGoalSummary(intentMd);
		const taskCounts = {
			TODO: card.taskCounts.TODO,
			DOING: card.taskCounts.DOING,
			"CHỜ-USER": card.taskCounts["CHỜ-USER"],
			BLOCKED: card.taskCounts.BLOCKED,
			DONE: card.taskCounts.DONE,
			SKIP: card.taskCounts.SKIP
		};
		const attentionTasks = card.attentionTasks.map((t) => ({
			id: t.id,
			title: Array.from(maskText(t.title)).slice(0, 120).join(""),
			status: t.status,
			note: Array.from(maskText(t.note || "")).slice(0, 160).join("")
		}));
		const documents = {
			intent: card.documents.intent,
			spec: card.documents.spec,
			plan: card.documents.plan,
			progress: card.documents.progress,
			research: card.documents.research,
			decision: card.documents.decision,
			review: card.documents.review
		};
		const warnings = card.warnings.map((w) => Array.from(maskText(w)).slice(0, 160).join(""));
		const entry = {
			id: card.id,
			path: card.path,
			git: {
				branch: gitInfo.branch,
				worktree: gitInfo.worktree
			},
			createdAt: parseCreatedAt(card.id),
			title: Array.from(maskText(card.title)).slice(0, 120).join(""),
			goalSummary,
			risk: card.risk,
			column: card.column,
			taskSource: card.taskSource,
			taskCounts,
			attentionTasks,
			documents,
			warnings
		};
		missions.push(entry);
	}
	const jsonStr = JSON.stringify({
		schemaVersion: 1,
		missions
	}, null, 2).replace(/\r\n/g, "\n") + "\n";
	return Buffer.from(jsonStr, "utf8");
}
function isRetryableError$1(err) {
	const code = err?.code;
	return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}
/**
* So sánh byte giữa file docs/artifact/index.json hiện có trên đĩa với Buffer sinh từ buildArtifactIndex(repoRoot).
* Nếu file không tồn tại hoặc byte khác nhau -> false, nếu khớp byte -> true.
*/
function isArtifactIndexFresh(repoRoot) {
	const indexPath = path.join(repoRoot, "docs", "artifact", "index.json");
	try {
		if (!fs.existsSync(indexPath)) return false;
		const existing = fs.readFileSync(indexPath);
		const fresh = buildArtifactIndex(repoRoot);
		return Buffer.compare(existing, fresh) === 0;
	} catch {
		return false;
	}
}
/**
* Sinh Buffer mới bằng buildArtifactIndex(repoRoot).
* Nếu file đã có trên đĩa và byte Buffer mới bằng file cũ -> không ghi lại, trả về { changed: false }.
* Nếu khác hoặc chưa có: ghi nguyên tử bằng file tạm cùng thư mục docs/artifact/,
* rename đè lên index.json (retry ngắn khi gặp EBUSY/EPERM/EACCES trên Windows,
* dọn dẹp file tạm nếu thất bại, giữ nguyên index cũ nếu có lỗi). Trả về { changed: true }.
*/
function syncArtifactIndex(repoRoot) {
	const artifactDir = path.join(repoRoot, "docs", "artifact");
	const indexPath = path.join(artifactDir, "index.json");
	const fresh = buildArtifactIndex(repoRoot);
	try {
		if (fs.existsSync(indexPath)) {
			const existing = fs.readFileSync(indexPath);
			if (Buffer.compare(existing, fresh) === 0) return { changed: false };
		}
	} catch {}
	fs.mkdirSync(artifactDir, { recursive: true });
	const tmpPath = path.join(artifactDir, `index.json.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`);
	fs.writeFileSync(tmpPath, fresh);
	const maxRetries = 5;
	const retryDelayMs = 25;
	for (let attempt = 0; attempt <= maxRetries; attempt++) try {
		fs.renameSync(tmpPath, indexPath);
		return { changed: true };
	} catch (err) {
		if (attempt === maxRetries || !isRetryableError$1(err)) {
			try {
				if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
			} catch {}
			throw err;
		}
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs);
	}
	return { changed: true };
}
//#endregion
//#region server/missionState.ts
function isRetryableError(err) {
	const code = err?.code;
	return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}
function atomicWriteFileSync(filePath, content) {
	const dir = path.dirname(filePath);
	const tmpPath = path.join(dir, `.intent.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
	fs.writeFileSync(tmpPath, content, "utf8");
	const maxRetries = 5;
	const retryDelayMs = 25;
	for (let attempt = 0; attempt <= maxRetries; attempt++) try {
		fs.renameSync(tmpPath, filePath);
		return;
	} catch (err) {
		if (attempt === maxRetries || !isRetryableError(err)) {
			try {
				if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
			} catch {}
			throw err;
		}
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs);
	}
}
/** Đặt trang_thai; giữ xong_luc khi đã done, còn lại đặt (done) hoặc xoá (archived | null). */
function applyState(lines, state, today) {
	const keepDoneDate = lines.some((l) => /^trang_thai\s*:\s*["']?done["']?\s*$/.test(l)) && lines.some((l) => /^xong_luc\s*:/.test(l));
	const out = lines.filter((l) => !(state === null && /^trang_thai\s*:/.test(l)) && !(state !== "done" && /^xong_luc\s*:/.test(l)));
	if (state === null) return out;
	const ts = out.findIndex((l) => /^trang_thai\s*:/.test(l));
	if (ts === -1) out.push(`trang_thai: ${state}`);
	else out[ts] = `trang_thai: ${state}`;
	if (state === "done") {
		const xl = out.findIndex((l) => /^xong_luc\s*:/.test(l));
		if (xl === -1) out.splice(out.findIndex((l) => /^trang_thai\s*:/.test(l)) + 1, 0, `xong_luc: ${today}`);
		else if (!keepDoneDate) out[xl] = `xong_luc: ${today}`;
	}
	return out;
}
/**
* Ghi nguyên tử trạng thái cuối (done | archived | null) vào front-matter của intent.md (D51).
* done ghi xong_luc (YYYY-MM-DD, mặc định hôm nay giờ máy), giữ ngày đầu nếu đã done; archived hoặc null xoá xong_luc.
* Giữ nguyên kiểu xuống dòng (LF/CRLF) và trả file về đúng byte ban đầu khi đặt rồi bỏ.
*/
function writeFinalState(intentPath, state, today = (/* @__PURE__ */ new Date()).toLocaleDateString("sv-SE")) {
	if (state !== "done" && state !== "archived" && state !== null) throw new Error(`Giá trị trạng thái cuối không hợp lệ: "${String(state)}"`);
	const content = fs.readFileSync(intentPath, "utf8");
	const newline = content.includes("\r\n") ? "\r\n" : "\n";
	const match = content.match(/^---(\r?\n)(?:([\s\S]*?)(\r?\n))?---[^\S\r\n]*(\r?\n|$)/);
	let newContent;
	if (match) {
		const openingNewline = match[1];
		const rawBody = match[2];
		const beforeClosing = match[3] ?? newline;
		const trailingNewline = match[4];
		const restOfFile = content.slice(match[0].length);
		const lines = applyState(rawBody ? rawBody.split(/\r?\n/) : [], state, today);
		if (!lines.some((l) => l.trim().length > 0)) newContent = restOfFile;
		else newContent = `---${openingNewline}${lines.join(newline)}${beforeClosing}---${trailingNewline}${restOfFile}`;
	} else if (state !== null) newContent = `---${newline}${applyState([], state, today).join(newline)}${newline}---${newline}${content}`;
	else newContent = content;
	atomicWriteFileSync(intentPath, newContent);
}
//#endregion
//#region server/budget.ts
var pos = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : void 0;
/** Đọc docs/agent/budget.json; thiếu / JSON hỏng / không có số dương hợp lệ → null (không cảnh báo). */
function readBudget(repoRoot) {
	try {
		const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, "docs", "agent", "budget.json"), "utf8"));
		const ngay_usd = pos(raw.ngay_usd);
		const thang_usd = pos(raw.thang_usd);
		if (ngay_usd === void 0 && thang_usd === void 0) return null;
		return {
			...ngay_usd !== void 0 && { ngay_usd },
			...thang_usd !== void 0 && { thang_usd },
			canh_bao_phan_tram: pos(raw.canh_bao_phan_tram) ?? 80
		};
	} catch {
		return null;
	}
}
var p2 = (n) => String(n).padStart(2, "0");
/** Cộng chi phí event trong ngày / tháng local hiện tại. */
function budgetStatus(cfg, events, now) {
	const d = new Date(now);
	const month = `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
	const day = `${month}-${p2(d.getDate())}`;
	const keyOf = (ts, len) => {
		const t = new Date(ts);
		return Number.isNaN(t.getTime()) ? "" : `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`.slice(0, len);
	};
	const line = (ky, kyKey, limitUsd) => {
		const spentUsd = aggregateCost(events.filter((e) => keyOf(e.ts, kyKey.length) === kyKey))?.costUsd ?? 0;
		const raw = spentUsd / limitUsd * 100;
		return {
			ky,
			kyKey,
			spentUsd,
			limitUsd,
			pct: Math.round(raw),
			level: raw >= 100 ? "CRIT" : raw >= cfg.canh_bao_phan_tram ? "WARN" : "OK"
		};
	};
	return [...cfg.ngay_usd ? [line("ngay", day, cfg.ngay_usd)] : [], ...cfg.thang_usd ? [line("thang", month, cfg.thang_usd)] : []];
}
//#endregion
//#region server/contextDetail.ts
var dayOf$1 = (iso) => {
	const d = new Date(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Phiên chính có BASE trong ngày `day` (giờ máy). linked: missionId → sessionIds. */
function daySessions(events, linked, day) {
	return events.filter((e) => e.kind === "BASE" && (e.agent === "main" || e.agent === "codex") && dayOf$1(e.ts) === day).map((e) => ({
		sessionId: e.sessionId.slice(0, 8),
		ts: e.ts,
		tokens: e.tokens ?? 0,
		parts: e.parts ?? null,
		model: e.model ?? null,
		missionId: [...linked].find(([, s]) => s.has(e.sessionId))?.[0] ?? null
	})).sort((a, b) => a.ts.localeCompare(b.ts));
}
var item = (name, chars) => ({
	name,
	chars,
	estTokens: Math.ceil(chars / 4)
});
var read = (f) => {
	try {
		return fs.readFileSync(f, "utf8");
	} catch {
		return null;
	}
};
var ls = (d) => {
	try {
		return fs.readdirSync(d);
	} catch {
		return [];
	}
};
/** Hỗ trợ `description:` một dòng và khối `>` `|` (kèm `-`/`+`): cộng độ dài các dòng thụt lề. */
var descChars = (text) => {
	const lines = (text.split(/^---\s*$/m)[1] ?? "").split(/\r?\n/);
	const i = lines.findIndex((l) => l.startsWith("description:"));
	if (i < 0) return 0;
	const head = lines[i].slice(12).trim();
	if (!/^[>|][+-]?$/.test(head)) return head.length;
	let n = 0;
	for (const l of lines.slice(i + 1)) {
		if (l.trim() && !/^\s/.test(l)) break;
		n += l.trim().length;
	}
	return n;
};
/** Chỉ độ dài — không trả nội dung. */
function composition(repoRoot) {
	const out = {
		claudeMd: [],
		rules: [],
		skills: [],
		agents: [],
		mcp: []
	};
	const home = process.env.OBSERVATORY_HOME ?? os.homedir();
	for (const [name, f] of [["CLAUDE.md (repo)", path.join(repoRoot, "CLAUDE.md")], ["~/.claude/CLAUDE.md", path.join(home, ".claude", "CLAUDE.md")]]) {
		const t = read(f);
		if (t !== null) out.claudeMd.push(item(name, t.length));
	}
	const cl = path.join(repoRoot, ".claude");
	for (const f of ls(path.join(cl, "rules")).filter((x) => x.endsWith(".md"))) {
		const t = read(path.join(cl, "rules", f));
		if (t !== null) out.rules.push(item(f, t.length));
	}
	for (const d of ls(path.join(cl, "skills"))) {
		const t = read(path.join(cl, "skills", d, "SKILL.md"));
		if (t !== null) out.skills.push(item(d, descChars(t)));
	}
	for (const f of ls(path.join(cl, "agents")).filter((x) => x.endsWith(".md"))) {
		const t = read(path.join(cl, "agents", f));
		if (t !== null) out.agents.push(item(f.replace(/\.md$/, ""), descChars(t)));
	}
	try {
		const servers = JSON.parse(read(path.join(repoRoot, ".mcp.json")) ?? "{}").mcpServers ?? {};
		for (const n of Object.keys(servers)) out.mcp.push(item(n, 0));
	} catch {}
	return out;
}
//#endregion
//#region server/repoStore.ts
var norm = (p) => {
	let r = path.resolve(p);
	try {
		r = fs.realpathSync.native(r);
	} catch {}
	return process.platform === "win32" ? r.toLowerCase() : r;
};
var repoId = (p) => createHash("sha1").update(norm(p)).digest("hex").slice(0, 8);
var storeFile = () => path.join(process.env.OBSERVATORY_HOME ?? os.homedir(), ".observatory", "repos.json");
/** Danh sách repo đã lưu; file thiếu / hỏng / sai shape → []. */
function readSaved() {
	try {
		const raw = JSON.parse(fs.readFileSync(storeFile(), "utf8"));
		return Array.isArray(raw.repos) ? raw.repos.filter((x) => typeof x === "string") : [];
	} catch {
		return [];
	}
}
function write(repos) {
	const f = storeFile();
	fs.mkdirSync(path.dirname(f), { recursive: true });
	const tmp = `${f}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmp, JSON.stringify({ repos }, null, 2));
		fs.renameSync(tmp, f);
	} catch (err) {
		try {
			fs.unlinkSync(tmp);
		} catch {}
		throw err;
	}
}
/** Thêm repo vào danh sách lưu. `taken` = đường dẫn đã có trong whitelist (main/worktree/extra). */
function addRepo(input, taken = []) {
	const p = String(input ?? "").trim();
	if (!p || p.includes(String.fromCharCode(0)) || !path.isAbsolute(p)) return {
		ok: false,
		reason: "Cần đường dẫn tuyệt đối tới thư mục repo"
	};
	if (process.platform === "win32" && p.startsWith(String.fromCharCode(92, 92))) return {
		ok: false,
		reason: "Chỉ nhận ổ đĩa cục bộ (không nhận đường dẫn mạng UNC)"
	};
	let real;
	try {
		real = fs.realpathSync.native(path.resolve(p));
	} catch {
		return {
			ok: false,
			reason: "Đường dẫn không tồn tại"
		};
	}
	if (!fs.statSync(real).isDirectory()) return {
		ok: false,
		reason: "Đường dẫn không phải thư mục"
	};
	let top;
	try {
		top = execFileSync("git", [
			"-C",
			real,
			"rev-parse",
			"--show-toplevel"
		], {
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			timeout: 5e3
		}).trim();
	} catch {
		return {
			ok: false,
			reason: "Thư mục không phải repo git"
		};
	}
	if (norm(top) !== norm(real)) return {
		ok: false,
		reason: "Phải là thư mục gốc của repo git (không phải thư mục con)"
	};
	try {
		if (!fs.lstatSync(path.join(real, "docs", "artifact")).isDirectory()) throw new Error("x");
	} catch {
		return {
			ok: false,
			reason: "Repo chưa có thư mục docs/artifact/ thật (không nhận symlink)"
		};
	}
	const key = norm(real);
	const saved = readSaved();
	if ([...taken, ...saved].some((t) => norm(t) === key)) return {
		ok: false,
		reason: "Repo đã có trong danh sách"
	};
	write([...saved, real]);
	return {
		ok: true,
		id: repoId(real)
	};
}
/** Xoá repo đã lưu theo id; false nếu không có. */
function removeRepo(id) {
	const saved = readSaved();
	const rest = saved.filter((p) => repoId(p) !== id);
	if (rest.length === saved.length) return false;
	write(rest);
	return true;
}
//#endregion
//#region server/repos.ts
function worktrees(startRepo) {
	let out;
	try {
		out = execFileSync("git", [
			"-C",
			startRepo,
			"worktree",
			"list",
			"--porcelain"
		], {
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		});
	} catch {
		return [];
	}
	const res = [];
	for (const block of out.split(/\r?\n\r?\n/)) {
		const lines = block.split(/\r?\n/);
		const wt = lines.find((l) => l.startsWith("worktree "));
		if (!wt || lines.some((l) => l === "bare" || l.startsWith("prunable"))) continue;
		const p = path.resolve(wt.slice(9));
		if (!fs.existsSync(p)) continue;
		res.push({
			path: p,
			branch: lines.find((l) => l.startsWith("branch "))?.replace(/^branch (refs\/heads\/)?/, "")
		});
	}
	return res;
}
function listRepos(startRepo, extras = []) {
	const start = startRepo === null ? null : path.resolve(startRepo);
	const wts = start === null ? [] : worktrees(start);
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	const add = (p, kind, branch) => {
		const key = norm(p);
		if (seen.has(key)) return;
		seen.add(key);
		const name = path.basename(p);
		out.push({
			id: repoId(p),
			label: branch ? `${name} · ${branch}` : name,
			kind,
			path: p
		});
	};
	if (start !== null) add(start, "main", wts.find((w) => norm(w.path) === norm(start))?.branch);
	for (const w of wts) add(w.path, "worktree", w.branch);
	for (const e of extras) if (fs.existsSync(e)) add(path.resolve(e), "extra");
	for (const s of readSaved()) if (fs.existsSync(s)) add(path.resolve(s), "saved");
	return out;
}
var resolveRepo = (list, id) => list.find((r) => r.id === id)?.path;
//#endregion
//#region server/stats.ts
var dayOf = (iso) => {
	const d = new Date(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
var median = (xs) => {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	return s[s.length >> 1];
};
/** Gộp theo ngày (giờ máy). Chỉ con số — không mang nội dung. */
function dailyStats(se, events) {
	const by = /* @__PURE__ */ new Map();
	const row = (day) => {
		let r = by.get(day);
		if (!r) by.set(day, r = {
			day,
			sessions: 0,
			baseMedian: null,
			costUsd: 0,
			compact: 0,
			cacheMiss: 0,
			hookBlock: 0,
			apiError: 0,
			bases: []
		});
		return r;
	};
	for (const e of se) {
		if (!e.ts) continue;
		const r = row(dayOf(e.ts));
		if (e.kind === "BASE") {
			r.sessions++;
			if (e.tokens) r.bases.push(e.tokens);
		}
		if (e.kind === "COMPACT") r.compact++;
		if (e.kind === "CACHE_MISS") r.cacheMiss++;
		if (e.kind === "HOOK_BLOCK") r.hookBlock++;
		if (e.kind === "API_ERROR") r.apiError++;
	}
	const evByDay = /* @__PURE__ */ new Map();
	for (const e of events) {
		if (!e.ts) continue;
		const day = dayOf(e.ts);
		const l = evByDay.get(day);
		if (l) l.push(e);
		else evByDay.set(day, [e]);
	}
	for (const [day, evs] of evByDay) row(day).costUsd = Math.round((aggregateCost(evs)?.costUsd ?? 0) * 100) / 100;
	return [...by.values()].map(({ bases, ...r }) => ({
		...r,
		baseMedian: median(bases)
	})).sort((a, b) => a.day.localeCompare(b.day));
}
/** Ngày trùng: số đếm lấy max từng trường (transcript xoá một phần không làm tụt), baseMedian theo hàng nhiều phiên hơn. Ngày chỉ có trong old được giữ. */
function mergeStats(old, fresh) {
	const m = new Map(old.map((r) => [r.day, r]));
	for (const r of fresh) {
		const o = m.get(r.day);
		m.set(r.day, !o ? r : {
			day: r.day,
			sessions: Math.max(o.sessions, r.sessions),
			costUsd: Math.max(o.costUsd, r.costUsd),
			compact: Math.max(o.compact, r.compact),
			cacheMiss: Math.max(o.cacheMiss, r.cacheMiss),
			hookBlock: Math.max(o.hookBlock, r.hookBlock),
			apiError: Math.max(o.apiError, r.apiError),
			baseMedian: (r.sessions >= o.sessions ? r : o).baseMedian
		});
	}
	return [...m.values()].sort((a, b) => a.day.localeCompare(b.day));
}
var fileOf = (repoRoot) => path.join(process.env.OBSERVATORY_HOME ?? os.homedir(), ".observatory", "stats", `${repoId(repoRoot)}.json`);
function readStats(repoRoot) {
	try {
		const raw = JSON.parse(fs.readFileSync(fileOf(repoRoot), "utf8"));
		return Array.isArray(raw.days) ? raw.days.filter((d) => typeof d?.day === "string") : [];
	} catch {
		return [];
	}
}
function writeStats(repoRoot, days) {
	const f = fileOf(repoRoot);
	fs.mkdirSync(path.dirname(f), { recursive: true });
	const tmp = `${f}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmp, JSON.stringify({ days }, null, 2));
		fs.renameSync(tmp, f);
	} catch (err) {
		try {
			fs.unlinkSync(tmp);
		} catch {}
		throw err;
	}
}
//#endregion
//#region server/summaryExport.ts
function pad(n) {
	return String(n).padStart(2, "0");
}
function dateParts(d) {
	return [
		String(d.getFullYear()),
		pad(d.getMonth() + 1),
		pad(d.getDate()),
		pad(d.getHours()),
		pad(d.getMinutes()),
		pad(d.getSeconds())
	];
}
function formatExportTimestamp(d) {
	const [Y, M, D, h, m, s] = dateParts(d);
	return `${Y}${M}${D}-${h}${m}${s}`;
}
function formatDateTime(d) {
	const [Y, M, D, h, m, s] = dateParts(d);
	return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}
function generateSummaryMarkdown(detail, exportDate = /* @__PURE__ */ new Date()) {
	const total = detail.tasks.length;
	const done = detail.tasks.filter((t) => t.status === "DONE").length;
	const doing = detail.tasks.filter((t) => t.status === "DOING").length;
	const blocked = detail.tasks.filter((t) => t.status === "BLOCKED").length;
	const todo = detail.tasks.filter((t) => t.status === "TODO").length;
	const waitUser = detail.tasks.filter((t) => t.status === "CHỜ-USER").length;
	const skip = detail.tasks.filter((t) => t.status === "SKIP").length;
	const tokens = detail.tokens ?? {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheCreationTokens: 0,
		totalTokens: 0
	};
	const costUsd = detail.cost?.costUsd ?? 0;
	const cacheHitRate = detail.cost?.cacheHitRate ?? 0;
	const est = tokens.estimated ? " (ước lượng — log không ghi usage thật)" : "";
	const lines = [
		`# Báo cáo Tổng kết Nhiệm vụ — [${detail.id}]`,
		"",
		`- **Ngày giờ xuất:** ${formatDateTime(exportDate)}`,
		`- **Mức độ rủi ro (Risk):** ${detail.risk ?? "Chưa xác định"}`,
		"",
		"## 1. Thống kê tiến độ",
		`- **Tổng số task:** ${total}`,
		`- **Số DONE:** ${done}`,
		`- **Số DOING:** ${doing}`,
		`- **Số BLOCKED:** ${blocked}`,
		`- **Số TODO:** ${todo}`
	];
	if (waitUser > 0) lines.push(`- **Số CHỜ-USER:** ${waitUser}`);
	if (skip > 0) lines.push(`- **Số SKIP:** ${skip}`);
	lines.push("", "## 2. Thống kê chi phí & Token", `- **Tổng token tiêu thụ:** ${tokens.totalTokens.toLocaleString()} tokens${est}`, `- **Input tokens:** ${tokens.inputTokens.toLocaleString()}`, `- **Output tokens:** ${tokens.outputTokens.toLocaleString()}`, `- **Cached tokens:** ${tokens.cacheReadTokens.toLocaleString()} (tạo cache: ${tokens.cacheCreationTokens.toLocaleString()})`, `- **Cache Hit Rate:** ${Math.round(cacheHitRate * 100)}%`, `- **Chi phí ước tính (USD):** $${costUsd.toFixed(4)}`, "", "## 3. Bằng chứng commit & Trạng thái task", "| Task ID | Tiêu đề | Trạng thái | Commit SHA | Người làm |", "|---|---|---|---|---|");
	for (const t of detail.tasks) {
		const sha = t.sha ? `\`${t.sha}\`` : "—";
		const who = t.who || "—";
		const cleanTitle = t.title.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
		lines.push(`| ${t.id} | ${cleanTitle} | ${t.status} | ${sha} | ${who} |`);
	}
	lines.push("");
	return lines.join("\n");
}
function exportSummary(ctx, id, nowMs = ctx.now()) {
	if (!listFolders(ctx.artifactRoot).includes(id)) return null;
	const detail = missionDetail(ctx, id);
	if (!detail) return null;
	const exportDate = new Date(nowMs);
	const content = generateSummaryMarkdown(detail, exportDate);
	const dir = path.join(ctx.artifactRoot, id);
	if (!fs.existsSync(dir)) return null;
	const tryWrite = (f) => {
		try {
			fs.writeFileSync(f, content, {
				encoding: "utf8",
				flag: "wx"
			});
			return true;
		} catch (e) {
			if (e.code === "EEXIST") return false;
			throw e;
		}
	};
	let chosenFile = path.join(dir, "summary.md");
	if (!tryWrite(chosenFile)) {
		const subDir = path.join(dir, "summary");
		fs.mkdirSync(subDir, { recursive: true });
		const base = path.join(subDir, `summary-${formatExportTimestamp(exportDate)}`);
		chosenFile = `${base}.md`;
		for (let i = 1; !tryWrite(chosenFile); i++) chosenFile = `${base}-${i}.md`;
	}
	return {
		ok: true,
		path: path.relative(ctx.repoRoot, chosenFile).split(path.sep).join("/"),
		content
	};
}
var states = /* @__PURE__ */ new WeakMap();
function refreshSources(sources, now = () => performance.now()) {
	const unique = /* @__PURE__ */ new Map();
	for (const source of sources) if (!unique.has(source.key)) unique.set(source.key, source);
	return Promise.all([...unique.values()].map((source) => {
		let state = states.get(source.key);
		if (!state) {
			state = {};
			states.set(source.key, state);
		}
		if (state.inFlight) return state.inFlight;
		if (state.completedAt !== void 0 && now() - state.completedAt < 1500) return Promise.resolve();
		const gate = state;
		const run = Promise.resolve().then(async () => {
			while (!source.refreshStep(performance.now() + 20)) await setImmediate$1();
		});
		gate.inFlight = run;
		run.then(() => {
			gate.completedAt = now();
			gate.inFlight = void 0;
		}, () => {
			gate.inFlight = void 0;
		});
		return run;
	})).then(() => {});
}
//#endregion
//#region server/agentLogs.ts
/**
* Đọc đuôi tối đa maxBytes của file jsonl, bỏ dòng đầu bị cắt ngang nếu có, bỏ dòng hỏng.
*/
function readJsonlTail(file, maxBytes = LOG_TAIL_BYTES) {
	if (!fs.existsSync(file)) return [];
	let stat;
	try {
		stat = fs.statSync(file);
	} catch {
		return [];
	}
	if (stat.size === 0) return [];
	const toRead = Math.min(stat.size, maxBytes);
	const start = stat.size - toRead;
	const buf = Buffer.alloc(toRead);
	let fd = null;
	try {
		fd = fs.openSync(file, "r");
		fs.readSync(fd, buf, 0, toRead, start);
	} catch {
		return [];
	} finally {
		if (fd !== null) fs.closeSync(fd);
	}
	let text = buf.toString("utf8");
	if (start > 0) {
		const nl = text.indexOf("\n");
		text = nl >= 0 ? text.slice(nl + 1) : "";
	}
	const lines = text.split("\n");
	const out = [];
	for (const l of lines) {
		const trimmed = l.trim();
		if (!trimmed) continue;
		try {
			out.push(JSON.parse(trimmed));
		} catch {}
	}
	return out;
}
/**
* Hợp tên các thư mục skill có SKILL.md trong .claude/skills và .agents/skills.
*/
function installedSkills(repoRoot) {
	const skills = /* @__PURE__ */ new Set();
	const dirs = [path.join(repoRoot, ".claude", "skills"), path.join(repoRoot, ".agents", "skills")];
	for (const d of dirs) {
		if (!fs.existsSync(d)) continue;
		try {
			for (const ent of fs.readdirSync(d, { withFileTypes: true })) if (ent.isDirectory() && fs.existsSync(path.join(d, ent.name, "SKILL.md"))) skills.add(ent.name);
		} catch {}
	}
	return [...skills].sort();
}
/**
* Thống kê lượt dùng skill từ docs/agent/skill-log/*.jsonl trong days ngày gần nhất.
*/
function skillReport(repoRoot, days = 30, now = Date.now()) {
	const installed = new Set(installedSkills(repoRoot));
	const logDir = path.join(repoRoot, process.env.ATHENA_SKILL_LOG_DIR || path.join("docs", "agent", "skill-log"));
	const cutoffMs = now - days * 864e5;
	const bySkill = /* @__PURE__ */ new Map();
	if (fs.existsSync(logDir)) {
		let files = [];
		try {
			files = fs.readdirSync(logDir).filter((f) => f.endsWith(".jsonl"));
		} catch {
			files = [];
		}
		for (const f of files) {
			const rows = readJsonlTail(path.join(logDir, f), LOG_TAIL_BYTES);
			for (const r of rows) {
				if (!r || typeof r !== "object") continue;
				const row = r;
				const skillName = typeof row.skill === "string" ? maskWhy(row.skill.trim()) : "";
				if (!skillName) continue;
				const timeStr = typeof row.t === "string" ? row.t : typeof row.ts === "string" ? row.ts : "";
				if (!timeStr) continue;
				const t = Date.parse(timeStr);
				if (isNaN(t) || t < cutoffMs || t > now) continue;
				let entry = bySkill.get(skillName);
				if (!entry) {
					entry = {
						calls: 0,
						last: null,
						lastTs: 0,
						lastArgs: ""
					};
					bySkill.set(skillName, entry);
				}
				entry.calls++;
				if (t >= entry.lastTs) {
					entry.lastTs = t;
					entry.last = timeStr;
					const rawArgs = typeof row.args === "string" ? row.args : row.args ? JSON.stringify(row.args) : "";
					entry.lastArgs = maskWhy(rawArgs).slice(0, 120);
				}
			}
		}
	}
	for (const s of installed) if (!bySkill.has(s)) bySkill.set(s, {
		calls: 0,
		last: null,
		lastTs: 0,
		lastArgs: ""
	});
	const skills = [];
	let total = 0;
	for (const [skill, data] of bySkill) {
		total += data.calls;
		skills.push({
			skill,
			calls: data.calls,
			last: data.last,
			lastArgs: data.lastArgs,
			installed: installed.has(skill)
		});
	}
	skills.sort((a, b) => {
		if (b.calls !== a.calls) return b.calls - a.calls;
		return a.skill.localeCompare(b.skill);
	});
	return {
		repo: path.basename(repoRoot),
		days,
		total,
		skills
	};
}
//#endregion
//#region server/flowScore.ts
var khoa = (r) => r.chon?.startsWith("#") ? r.chon : r.luong?.[0] || r.de_xuat || "?";
var dem = (o, k) => {
	o[k] = (o[k] || 0) + 1;
};
function tinh(rows) {
	const theoLuong = {};
	const khac = {};
	const gate = {};
	for (const r of rows) {
		if (r.gate) dem(gate, r.gate);
		const k = khoa(r);
		const x = theoLuong[k] ||= {
			phien: 0,
			lech: 0,
			doi: 0,
			suaPhien: 0,
			sua: 0,
			commit: 0,
			turns: 0,
			outTok: 0,
			suaTheoBuoc: {},
			chuoi: {}
		};
		x.phien++;
		if (r.de_xuat && r.chon?.startsWith("#") && r.de_xuat !== r.chon) x.lech++;
		if ((r.luong || []).length > 1) x.doi++;
		if (r.sua?.length) x.suaPhien++;
		x.sua += r.sua?.length || 0;
		for (const b of r.sua || []) dem(x.suaTheoBuoc, b);
		if (r.commit) x.commit++;
		x.turns += r.turns || 0;
		x.outTok += r.out_tok || 0;
		const gon = (r.steps || []).filter((b, i, a) => b !== a[i - 1]);
		if (gon.length) dem(x.chuoi, gon.join(" → "));
		if (k === "khác" && r.khac) dem(khac, r.khac);
	}
	return {
		theoLuong,
		khac,
		gate
	};
}
function drift(rowsTruoc, rowsSau) {
	const a = tinh(rowsTruoc).theoLuong;
	const b = tinh(rowsSau).theoLuong;
	const kq = [];
	for (const [luong, t] of Object.entries(a)) {
		const s = b[luong];
		if (!s || t.phien < 5 || s.phien < 5) continue;
		const lech = s.suaPhien * t.phien - t.suaPhien * s.phien;
		if (Math.abs(lech) * 10 > t.phien * s.phien) kq.push({
			luong,
			truoc: t.suaPhien / t.phien,
			sau: s.suaPhien / s.phien,
			chieu: lech > 0 ? "xấu đi" : "tốt lên"
		});
	}
	return kq;
}
function flowReport(repoRoot, days = 30, now = Date.now()) {
	const dir = path.join(repoRoot, process.env.ATHENA_ROUTE_LOG_DIR || path.join("docs", "agent", "route-log"));
	const cutoff = now - days * 864e5;
	const mid = now - days / 2 * 864e5;
	const rows = [];
	if (fs.existsSync(dir)) {
		let files = [];
		try {
			files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
		} catch {
			files = [];
		}
		for (const f of files) {
			const rawRows = readJsonlTail(path.join(dir, f), LOG_TAIL_BYTES);
			for (const r of rawRows) {
				if (!r || typeof r !== "object") continue;
				const row = r;
				if (typeof row.ts !== "string") continue;
				const ts = Date.parse(row.ts);
				if (isNaN(ts) || ts < cutoff || ts > now) continue;
				rows.push({
					ts: row.ts,
					conv: String(row.conv ?? ""),
					de_xuat: typeof row.de_xuat === "string" ? row.de_xuat : null,
					chon: typeof row.chon === "string" ? row.chon : null,
					luong: Array.isArray(row.luong) ? row.luong.map(String) : [],
					khac: typeof row.khac === "string" ? row.khac : void 0,
					steps: Array.isArray(row.steps) ? row.steps.map(String) : [],
					sua: Array.isArray(row.sua) ? row.sua.map(String) : [],
					turns: Number(row.turns) || 0,
					out_tok: Number(row.out_tok) || 0,
					commit: row.commit === true,
					gate: String(row.gate ?? "")
				});
			}
		}
	}
	const { theoLuong, khac, gate } = tinh(rows);
	const stats = Object.entries(theoLuong).map(([k, x]) => ({
		luong: k,
		phien: x.phien,
		lech: x.lech,
		doi: x.doi,
		suaPhien: x.suaPhien,
		sua: x.sua,
		commit: x.commit,
		turns: x.turns,
		outTok: x.outTok,
		tinCay: Number(((x.phien - x.suaPhien + 1) / (x.phien + 2)).toFixed(2)),
		suaTheoBuoc: x.suaTheoBuoc,
		chuoi: x.chuoi
	}));
	stats.sort((a, b) => b.phien - a.phien);
	const maskedKhac = {};
	for (const [k, count] of Object.entries(khac)) {
		const masked = maskWhy(k);
		maskedKhac[masked] = (maskedKhac[masked] || 0) + count;
	}
	const totalGate = Object.values(gate).reduce((a, b) => a + b, 0);
	const gateTruotPct = totalGate > 0 ? Math.round(100 * ((gate.muon || 0) + (gate.thieu || 0)) / totalGate) : null;
	const driftReport = drift(rows.filter((r) => {
		const t = Date.parse(r.ts);
		return t >= cutoff && t < mid;
	}), rows.filter((r) => {
		const t = Date.parse(r.ts);
		return t >= mid && t <= now;
	})).map((d) => ({
		luong: d.luong,
		truoc: d.truoc,
		sau: d.sau,
		chieu: d.chieu === "xấu đi" ? "tang" : "giam"
	}));
	return {
		repo: path.basename(repoRoot),
		days,
		tong: rows.length,
		theoLuong: stats,
		khac: maskedKhac,
		gate,
		gateTruotPct,
		drift: driftReport
	};
}
//#endregion
//#region server/agents.ts
var DAY_MS = 864e5;
function declaredAgents(repoRoot) {
	const names = /* @__PURE__ */ new Set();
	for (const [dir, ext] of [
		[".claude/agents", ".md"],
		[".agents/agents", ".md"],
		[".codex/agents", ".toml"]
	]) {
		let files;
		try {
			files = fs.readdirSync(path.join(repoRoot, dir));
		} catch {
			continue;
		}
		for (const file of files.filter((name) => name.endsWith(ext))) try {
			const content = fs.readFileSync(path.join(repoRoot, dir, file), "utf8");
			const header = ext === ".md" ? content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] : content.split(/^\s*\[/m, 1)[0];
			const name = (ext === ".md" ? header?.match(/^name:[ \t]*([^\r\n]+)/m)?.[1] : header?.match(/^name[ \t]*=[ \t]*"([^"]+)"/m)?.[1])?.trim();
			names.add(name || path.basename(file, ext));
		} catch {
			continue;
		}
	}
	return [...names].sort();
}
function agentReport(events, linked, days, now, declared = []) {
	const missionsBySession = /* @__PURE__ */ new Map();
	for (const [mission, sessions] of linked) for (const session of sessions) {
		if (!missionsBySession.has(session)) missionsBySession.set(session, /* @__PURE__ */ new Set());
		missionsBySession.get(session).add(mission);
	}
	const recent = events.filter((ev) => {
		return Date.parse(ev.ts) >= now - days * DAY_MS;
	});
	const groups = /* @__PURE__ */ new Map();
	for (const ev of recent) {
		if (!groups.has(ev.agent)) groups.set(ev.agent, []);
		groups.get(ev.agent).push(ev);
	}
	const agents = [...groups].map(([agent, group]) => ({
		agent,
		role: classifyRole(agent),
		runs: new Set(group.map((ev) => ev.run ?? ev.sessionId)).size,
		calls: group.length,
		errors: group.filter((ev) => ev.isError === true).length,
		tokens: aggregateTokens(group) ?? null,
		costUsd: aggregateCost(group)?.costUsd ?? 0,
		models: [...new Set(group.map((ev) => ev.model).filter((model) => !!model))].sort(),
		lastAt: group.reduce((last, ev) => !last || Date.parse(ev.ts) > Date.parse(last) ? ev.ts : last, null),
		missions: [...new Set(group.flatMap((ev) => [...missionsBySession.get(ev.sessionId) ?? []]))].sort()
	})).sort((a, b) => b.calls - a.calls || a.agent.localeCompare(b.agent));
	const totals = {
		agents: agents.length,
		runs: agents.reduce((sum, agent) => sum + agent.runs, 0),
		calls: recent.length,
		tokens: aggregateTokens(recent)?.totalTokens ?? 0,
		costUsd: aggregateCost(recent)?.costUsd ?? 0
	};
	for (const agent of [...new Set(declared)].filter((name) => !groups.has(name)).sort()) agents.push({
		agent,
		role: classifyRole(agent),
		runs: 0,
		calls: 0,
		errors: 0,
		tokens: null,
		costUsd: 0,
		models: [],
		lastAt: null,
		missions: []
	});
	return {
		days,
		totals,
		agents
	};
}
//#endregion
//#region server/hoSo.ts
var MAX_DOC_BYTES = 2097152;
var FIXED = {
	c4: [
		"docs",
		"kien-truc",
		"c4.md"
	],
	contract: [
		"docs",
		"kien-truc",
		"c4.md"
	],
	"thuat-ngu": ["GLOSSARY.md"],
	"ban-do-thuat-ngu": ["GLOSSARY-MAP.md"]
};
/** Đường dưới repoRoot mà mọi thư mục cha là thư mục thật (không symlink); sai → null. */
function realPath(repoRoot, parts) {
	let cur = repoRoot;
	for (const [i, part] of parts.entries()) {
		cur = path.join(cur, part);
		try {
			const st = fs.lstatSync(cur);
			if (st.isSymbolicLink() || i < parts.length - 1 && !st.isDirectory()) return null;
		} catch {
			return null;
		}
	}
	return cur;
}
function readFile(file) {
	try {
		const st = fs.lstatSync(file);
		return st.isFile() && st.size <= MAX_DOC_BYTES ? fs.readFileSync(file, "utf8") : null;
	} catch {
		return null;
	}
}
function adrNames(repoRoot) {
	const dir = realPath(repoRoot, ["docs", "adr"]);
	if (!dir || !fs.lstatSync(dir).isDirectory()) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && /^[\w.-]+\.md$/.test(e.name) && e.name !== "README.md").map((e) => e.name);
}
var scalar = (v) => {
	const s = (v ?? "").replace(/(^|\s)#.*$/, "").trim();
	return s === "" || s === "null" ? null : s;
};
var list = (v) => {
	return (scalar(v)?.match(/^\[(.*)\]$/)?.[1] ?? "").split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
};
function listAdr(repoRoot) {
	const dir = path.join(repoRoot, "docs", "adr");
	const items = [];
	for (const ten of adrNames(repoRoot)) {
		const md = readFile(path.join(dir, ten));
		if (md === null) continue;
		const fm = frontMatter(md);
		items.push({
			ten,
			tieuDe: md.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").match(/^# (.+)$/m)?.[1].trim() ?? ten,
			trangThai: scalar(fm.trang_thai),
			ngay: scalar(fm.ngay),
			khuVuc: list(fm.khu_vuc),
			thayThe: list(fm.thay_the),
			biThayBoi: scalar(fm.bi_thay_boi),
			chotBoi: md.match(/^- Chốt bởi:[ \t]*(.*?)[ \t]*(?: · .*)?$/m)?.[1] || null
		});
	}
	return items.sort((a, b) => (b.ngay ?? "").localeCompare(a.ngay ?? "") || a.ten.localeCompare(b.ten));
}
/** Mục `## Contract` của c4.md, tới `## ` kế tiếp hoặc hết file. */
var CONTRACT = /^## Contract[ \t]*\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m;
/** GLOSSARY.md: nhóm theo `## `; khối `**Tên**:`, dòng định nghĩa, `_Tránh_: ...`; dòng trống đóng khối; nhóm không có khối bị bỏ. */
function parseGlossary(md) {
	const groups = [];
	let row = null;
	for (const line of md.split(/\r?\n/)) {
		const head = line.match(/^## (.+)/)?.[1];
		const ten = line.match(/^\*\*(.+)\*\*:\s*$/)?.[1];
		const tranh = line.match(/^_Tránh_:\s*(.*)$/)?.[1];
		if (head !== void 0) {
			groups.push({
				tieuMuc: head.trim(),
				rows: []
			});
			row = null;
		} else if (ten !== void 0 && groups.length) {
			row = {
				ten,
				dinhNghia: "",
				tranh: ""
			};
			groups.at(-1).rows.push(row);
		} else if (!line.trim()) row = null;
		else if (row && tranh !== void 0) row.tranh = tranh.trim();
		else if (row) row.dinhNghia = `${row.dinhNghia} ${line.trim()}`.trim();
	}
	return groups.filter((g) => g.rows.length);
}
function readHoSoDoc(repoRoot, loai, ten) {
	if (loai !== "adr") {
		const file = realPath(repoRoot, FIXED[loai]);
		const text = file && readFile(file);
		if (loai === "contract") return text?.match(CONTRACT)?.[0] ?? null;
		return loai === "c4" && text ? text.replace(CONTRACT, "") : text;
	}
	return ten !== void 0 && adrNames(repoRoot).includes(ten) ? readFile(path.join(repoRoot, "docs", "adr", ten)) : null;
}
function hoSoReport(repoRoot) {
	const has = (loai) => readHoSoDoc(repoRoot, loai) !== null;
	return {
		adr: listAdr(repoRoot),
		c4: has("c4"),
		contract: has("contract"),
		thuatNgu: has("thuat-ngu"),
		thuatNguNhom: parseGlossary(readHoSoDoc(repoRoot, "thuat-ngu") ?? ""),
		banDoThuatNgu: has("ban-do-thuat-ngu")
	};
}
//#endregion
//#region server/inbox.ts
var MAX_FILE_BYTES = 2097152;
var TS = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
var AI = /^[\w.-]{1,32}$/;
/** Dòng `hit` của inbox, chữ đã che, ts giảm dần. Chỉ trả ts, ai, text. */
function inboxHits(repoRoot, limit = 200) {
	const dir = realPath(repoRoot, [
		"docs",
		"agent",
		"inbox"
	]);
	if (!dir || !fs.lstatSync(dir).isDirectory()) return [];
	const hits = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, e.name);
		if (!e.isFile() || !/^[\w.-]+\.jsonl$/.test(e.name) || fs.lstatSync(file).size > MAX_FILE_BYTES) continue;
		for (const r of readJsonlTail(file, MAX_FILE_BYTES)) {
			const row = r;
			if (row?.hit !== true || typeof row.text !== "string" || typeof row.ts !== "string" || !TS.test(row.ts) || Number.isNaN(Date.parse(row.ts))) continue;
			hits.push({
				ts: row.ts,
				ai: typeof row.ai === "string" && AI.test(row.ai) ? row.ai : "",
				text: maskWhy(row.text)
			});
		}
	}
	return hits.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, limit);
}
//#endregion
//#region ../../packages/core/.apm/skills/docs-standards/scripts/kiem-lo-trinh.mjs
/** @typedef {{ id: string, title: string, trang_thai: 'done'|'archived'|null, hang_muc: string|null, module: string|null, xong_luc: string|null, tieu_chi: string[] }} MissionMeta */
/** @typedef {{ dat: number, datIds: string[], tong: number, diemTB: number|null, quaHan: boolean }} TongHop */
/** @typedef {{ coFile: boolean, phienBan: 1|2|null, loi: string[], quaHan: string[], canhBao: string[], loTrinh: object|null, tongHop: Record<string, TongHop>, mission: MissionMeta[] }} KetQua */
function missionOf(repoRoot) {
	const dir = path.join(repoRoot, "docs/artifact");
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().filter((id) => fs.existsSync(path.join(dir, id, "intent.md"))).map((id) => {
		const text = fs.readFileSync(path.join(dir, id, "intent.md"), "utf8");
		const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
		const meta = Object.fromEntries(fm.split(/\r?\n/).map((line) => /^([^ :][^:]*):\s*(.*)$/.exec(line)).filter(Boolean).map((m) => [m[1].trim(), m[2].trim().replace(/^(["'])(.*)\1$/, "$2")]));
		return {
			id,
			title: /^# (.+)$/m.exec(text)?.[1].trim() || id,
			trang_thai: ["done", "archived"].includes(meta.trang_thai) ? meta.trang_thai : null,
			hang_muc: meta.hang_muc || null,
			module: meta.module || null,
			xong_luc: meta.xong_luc || null,
			tieu_chi: meta.tieu_chi ? meta.tieu_chi.split(",").map((x) => x.trim()).filter(Boolean) : []
		};
	});
}
/**
* @param {string} repoRoot
* @param {string} [today]
* @returns {KetQua}
*/
function kiemLoTrinh(repoRoot, today = (/* @__PURE__ */ new Date()).toLocaleDateString("sv-SE")) {
	const result = {
		coFile: false,
		phienBan: null,
		loi: [],
		quaHan: [],
		canhBao: [],
		loTrinh: null,
		tongHop: {},
		mission: missionOf(repoRoot)
	};
	const file = path.join(repoRoot, "docs/du-an/lo-trinh.json");
	if (!fs.existsSync(file)) return result;
	result.coFile = true;
	try {
		result.loTrinh = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		result.loi.push("lo-trinh.json · JSON không đọc được");
		return result;
	}
	const data = result.loTrinh;
	const error = (where, why) => result.loi.push(`${where} · ${why}`);
	const warn = (where, why) => result.canhBao.push(`${where} · ${why}`);
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		error("lo-trinh.json", "phải là object");
		return result;
	}
	if (![1, 2].includes(data.schemaVersion)) error("lo-trinh.json", "schemaVersion phải là 1 hoặc 2");
	else result.phienBan = data.schemaVersion;
	for (const key of [
		"module",
		"dich",
		"hang_muc"
	]) if (!Array.isArray(data[key])) error("lo-trinh.json", `${key} phải là mảng`);
	if (result.loi.length) return result;
	const v2 = data.schemaVersion === 2;
	if (!v2) warn("lo-trinh.json", "schemaVersion 1 — chạy migrate-lo-trinh.mjs để lên bản 2");
	const date = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
	const line = (value) => typeof value === "string" && !!value.trim() && !/[\r\n]/.test(value);
	const reached = (criterion, threshold) => v2 ? (criterion.diem ?? 0) >= threshold : criterion.dat_luc != null;
	const overdue = (item) => !!item?.han && item.han < today && !["DONE", "SKIP"].includes(item.trang_thai);
	const criterionIds = /* @__PURE__ */ new Set();
	const ids = /* @__PURE__ */ new Set();
	const validId = (item, kind, pattern) => {
		const id = item?.id;
		const where = `lo-trinh.json ${id || kind}`;
		if (typeof id !== "string" || !pattern.test(id)) error(where, "id không hợp lệ");
		if (ids.has(id)) error(where, "id trùng");
		ids.add(id);
		if (typeof item?.ten !== "string" || !item.ten.trim() || /[\r\n]/.test(item.ten)) error(where, "thiếu ten hoặc ten không phải một dòng");
		return where;
	};
	const validStatus = (item, where) => {
		if (!item || typeof item !== "object") {
			error(where, "thiếu mục");
			return;
		}
		if (![
			"TODO",
			"DOING",
			"DONE",
			"SKIP"
		].includes(item.trang_thai)) error(where, "trang_thai ngoài danh sách");
		if (item.han != null && !date(item.han)) error(where, "han không hợp lệ");
		else if (overdue(item)) (v2 ? result.quaHan : result.canhBao).push(`${where} · quá han${v2 ? ` ${item.han} — đổi han kèm doi_han, hoặc SKIP` : ""}`);
		if (v2) {
			if (!Object.hasOwn(item, "chu") || item.chu != null && (!line(item.chu) || item.chu.includes("@"))) error(where, "chu không hợp lệ");
			if (!Object.hasOwn(item, "doi_han") || !Array.isArray(item.doi_han)) error(where, "doi_han không phải mảng");
			else for (const [i, change] of item.doi_han.entries()) if (!change || !date(change.han_cu) || !line(change.ly_do)) error(`${where} doi_han[${i}]`, "thiếu han_cu hoặc ly_do");
			if (Array.isArray(item.doi_han) && item.doi_han.length && date(item.han) && item.han <= item.doi_han.at(-1)?.han_cu) warn(where, "han không sau han_cu cuối của doi_han");
			if (!Object.hasOwn(item, "khong_lam") || !Array.isArray(item.khong_lam)) error(where, "khong_lam không phải mảng");
			else for (const [i, value] of item.khong_lam.entries()) if (!line(value)) error(`${where} khong_lam[${i}]`, "phải là chuỗi một dòng");
		}
		if (v2 ? !Array.isArray(item.tieu_chi) : item.tieu_chi !== void 0 && !Array.isArray(item.tieu_chi)) error(where, "tieu_chi không phải mảng");
		else for (const [i, criterion] of (item.tieu_chi ?? []).entries()) {
			const at = `${where} tieu_chi[${i}]`;
			if (!criterion || typeof criterion.noi_dung !== "string" || !criterion.noi_dung.trim() || typeof criterion.kiem !== "string" || !criterion.kiem.trim()) error(at, "thiếu noi_dung hoặc kiem");
			for (const key of ["dat_luc", "bang_chung"]) if (criterion?.[key] != null && typeof criterion[key] !== "string") error(at, `${key} không hợp lệ`);
			if (criterion?.dat_luc != null && !date(criterion.dat_luc)) error(at, "dat_luc không hợp lệ");
			if (v2) {
				if (typeof criterion?.id !== "string" || !/^TC-\d+$/.test(criterion.id)) error(at, "id không hợp lệ");
				else if (criterionIds.has(criterion.id)) error(at, "id trùng");
				else criterionIds.add(criterion.id);
				if (!Object.hasOwn(criterion ?? {}, "diem") || criterion.diem != null && (typeof criterion.diem !== "number" || !Number.isFinite(criterion.diem) || criterion.diem < 0 || criterion.diem > 1)) error(at, "diem ngoài [0, 1]");
			}
		}
	};
	for (const item of data.module) validId(item, "module", /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
	for (const item of data.dich) {
		const where = validId(item, "dich", /^DICH-\d+$/);
		if (![
			"xay_moi",
			"nang_cap",
			"van_hanh"
		].includes(item?.loai)) error(where, "loai ngoài danh sách");
		validStatus(item, where);
		if (["xay_moi", "nang_cap"].includes(item?.loai) && !item.tieu_chi?.length) error(where, "Đích thiếu tiêu chí");
		if (v2 && (!Object.hasOwn(item ?? {}, "nguong") || typeof item.nguong !== "number" || !Number.isFinite(item.nguong) || item.nguong <= 0 || item.nguong > 1)) error(where, "nguong ngoài (0, 1]");
	}
	for (const item of data.hang_muc) {
		const where = validId(item, "hang_muc", /^HM-\d+$/);
		if (!["module", "giai_doan"].includes(item?.loai)) error(where, "loai ngoài danh sách");
		validStatus(item, where);
		if (v2 && (!Object.hasOwn(item ?? {}, "pha") || ![
			null,
			"do",
			"lam"
		].includes(item.pha))) error(where, "pha không hợp lệ");
		if (v2 && item?.trang_thai === "DOING" && item.pha == null) warn(where, "DOING chưa có pha");
	}
	const dichIds = new Set(data.dich.map((x) => x?.id));
	const moduleIds = new Set(data.module.map((x) => x?.id));
	const hangMucIds = new Set(data.hang_muc.map((x) => x?.id));
	for (const item of data.dich) if (item?.thay_the != null && !dichIds.has(item.thay_the)) error(`lo-trinh.json ${item.id}`, "thay_the trỏ id không có");
	for (const item of data.hang_muc) {
		const where = `lo-trinh.json ${item?.id || "hang_muc"}`;
		if (!dichIds.has(item?.dich)) error(where, "dich trỏ id không có");
		if (item?.module != null && !moduleIds.has(item.module)) error(where, "module trỏ id không có");
		if (item?.trang_thai === "DONE" && result.mission.some((m) => m.hang_muc === item.id && m.trang_thai === null)) warn(where, "DONE còn mission chưa xong");
	}
	const doing = data.dich.filter((x) => x?.trang_thai === "DOING" && x.loai !== "van_hanh");
	if (doing.length > 1) warn("lo-trinh.json", `hơn một Đích DOING không phải van_hanh (${doing.map((x) => x.id).join(", ")}) — để một Đích chính DOING, Đích kia TODO hoặc SKIP`);
	for (const mission of result.mission) {
		const where = `docs/artifact/${mission.id}/intent.md`;
		if (mission.hang_muc && !hangMucIds.has(mission.hang_muc)) warn(where, `hang_muc ${mission.hang_muc} không có`);
		if (mission.module && !moduleIds.has(mission.module)) warn(where, `module ${mission.module} không có`);
		if (v2 && mission.hang_muc) {
			const item = data.hang_muc.find((x) => x?.id === mission.hang_muc);
			const parent = data.dich.find((x) => x?.id === item?.dich);
			const allowed = new Set([...item?.tieu_chi ?? [], ...parent?.tieu_chi ?? []].map((x) => x?.id));
			for (const id of mission.tieu_chi) if (!criterionIds.has(id)) warn(where, `tieu_chi ${id} không có`);
			else if (!allowed.has(id)) warn(where, `tieu_chi ${id} không thuộc hạng mục hoặc Đích cha`);
		}
	}
	if (result.loi.length) return result;
	for (const item of [...data.dich, ...data.hang_muc]) {
		const parent = data.dich.find((x) => x.id === (item.dich ?? item.id));
		const threshold = v2 && typeof parent?.nguong === "number" && parent.nguong > 0 && parent.nguong <= 1 ? parent.nguong : 1;
		const criteria = item.tieu_chi ?? [];
		const achieved = criteria.filter((x) => reached(x, threshold));
		const dat = achieved.length;
		const datIds = v2 ? achieved.map((x) => x.id) : [];
		const average = v2 && criteria.length ? criteria.reduce((sum, x) => sum + (x.diem ?? 0), 0) / criteria.length : null;
		const diemTB = average == null ? null : Math.round(average * 100) / 100;
		result.tongHop[item.id] = {
			dat,
			datIds,
			tong: criteria.length,
			diemTB,
			quaHan: overdue(item)
		};
		const where = `lo-trinh.json ${item.id}`;
		if (data.dich.includes(item) && item.trang_thai === "DONE") {
			if (v2 && average != null && average < threshold) warn(where, "DONE có điểm trung bình dưới nguong");
			if (!v2 && criteria.some((x) => !x.dat_luc)) warn(where, "DONE còn tiêu chí chưa có dat_luc");
		}
		if (data.hang_muc.includes(item) && item.trang_thai === "DONE" && dat < criteria.length) warn(where, "DONE còn tiêu chí chưa đạt");
		if (!["DONE", "SKIP"].includes(item.trang_thai)) for (const criterion of criteria) {
			if (!date(criterion.dat_luc)) continue;
			const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${criterion.dat_luc}T00:00:00Z`)) / 864e5);
			if (days > 90) warn(where, `tiêu chí ${v2 ? criterion.id : criterion.noi_dung} đạt từ ${criterion.dat_luc} (${days} ngày) — nên kiểm lại`);
		}
	}
	return result;
}
if (path.basename(process.argv[1] ?? "") === "kiem-lo-trinh.mjs") {
	const args = process.argv.slice(2);
	const result = kiemLoTrinh(args.find((arg) => arg !== "--json") ?? process.cwd());
	if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else if (!result.coFile) console.log("chưa có docs/du-an/lo-trinh.json");
	else {
		for (const item of result.loi) console.log(`LỖI · ${item}`);
		for (const item of result.quaHan) console.log(`QUÁ HẠN · ${item}`);
		for (const item of result.canhBao) console.log(`CẢNH BÁO · ${item}`);
	}
	process.exitCode = result.loi.length || result.quaHan.length ? 1 : 0;
}
//#endregion
//#region server/roadmap.ts
function roadmapReport(repoRoot, today) {
	const result = kiemLoTrinh(repoRoot, today);
	const loTrinh = result.loTrinh;
	const free = (value) => typeof value === "string" ? maskText(value) : value;
	const privateFields = (item) => ({
		...item,
		...item.chu !== void 0 && { chu: free(item.chu) },
		...Array.isArray(item.khong_lam) && { khong_lam: item.khong_lam.map(free) },
		...Array.isArray(item.doi_han) && { doi_han: item.doi_han.map((change) => change && typeof change === "object" ? {
			...change,
			ly_do: free(change.ly_do)
		} : change) }
	});
	const criteria = (items) => (Array.isArray(items) ? items : []).map((item) => item && typeof item === "object" ? {
		...item,
		noi_dung: free(item.noi_dung),
		kiem: free(item.kiem),
		bang_chung: free(item.bang_chung ?? null),
		dat_luc: item.dat_luc ?? null
	} : item);
	const maskedRoadmap = loTrinh && typeof loTrinh === "object" && !Array.isArray(loTrinh) ? {
		...loTrinh,
		module: Array.isArray(loTrinh.module) ? loTrinh.module.map((item) => item && typeof item === "object" ? {
			...item,
			ten: free(item.ten)
		} : item) : loTrinh.module,
		dich: Array.isArray(loTrinh.dich) ? loTrinh.dich.map((item) => item && typeof item === "object" ? privateFields({
			...item,
			ten: free(item.ten),
			tieu_chi: criteria(item.tieu_chi)
		}) : item) : loTrinh.dich,
		hang_muc: Array.isArray(loTrinh.hang_muc) ? loTrinh.hang_muc.map((item) => item && typeof item === "object" ? privateFields({
			...item,
			ten: free(item.ten),
			tieu_chi: criteria(item.tieu_chi)
		}) : item) : loTrinh.hang_muc
	} : loTrinh;
	const projectDir = path.join(repoRoot, ".apm/instructions");
	const projectFile = fs.existsSync(projectDir) ? fs.readdirSync(projectDir).sort().find((name) => /^00-project-.*\.instructions\.md$/.test(name)) : void 0;
	const project = projectFile ? fs.readFileSync(path.join(projectDir, projectFile), "utf8") : "";
	const field = (label) => {
		const value = project.match(new RegExp(`^- ${label}:\\s*(.+)$`, "m"))?.[1].trim();
		return value ? maskText(value) : null;
	};
	const glossary = path.join(repoRoot, "GLOSSARY.md");
	const adrDir = path.join(repoRoot, "docs/adr");
	const hoSo = {
		ten: field("Tên"),
		stack: field("Stack"),
		c4: fs.existsSync(path.join(repoRoot, "docs/kien-truc/c4.md")),
		thuatNgu: fs.existsSync(glossary) ? (fs.readFileSync(glossary, "utf8").match(/^\*\*[^*]+\*\*:/gm) ?? []).length : 0,
		adrAccepted: fs.existsSync(adrDir) ? fs.readdirSync(adrDir).filter((name) => name.endsWith(".md") && name !== "README.md" && frontMatter(fs.readFileSync(path.join(adrDir, name), "utf8")).trang_thai === "accepted").length : 0
	};
	return {
		coFile: result.coFile,
		phienBan: result.phienBan,
		loi: result.loi.map(maskText),
		quaHan: result.quaHan.map(maskText),
		canhBao: result.canhBao.map(maskText),
		tongHop: result.tongHop,
		loTrinh: maskedRoadmap,
		mission: result.mission.map((mission) => ({
			...mission,
			title: maskText(mission.title),
			tieu_chi: mission.tieu_chi.map(maskText)
		})),
		hoSo
	};
}
//#endregion
//#region server/plugin.ts
function sendJson(req, res, status, body) {
	const text = JSON.stringify(body);
	if (status !== 200) {
		res.statusCode = status;
		res.end(text);
		return;
	}
	const etag = `"${createHash("sha1").update(text).digest("base64url").slice(0, 16)}"`;
	res.setHeader("ETag", etag);
	res.setHeader("Cache-Control", "no-cache");
	if (req.headers?.["if-none-match"] === etag) {
		res.statusCode = 304;
		res.end();
		return;
	}
	res.statusCode = 200;
	res.end(text);
}
function getDays(req, res, def) {
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	if (req.method !== "GET") {
		res.statusCode = 405;
		res.end(JSON.stringify({ error: "chỉ nhận GET" }));
		return null;
	}
	const daysRaw = new URLSearchParams((req.url ?? "").split("?")[1] ?? "").get("days");
	if (daysRaw === null) return def;
	const d = Number(daysRaw);
	if (!Number.isInteger(d) || d < 1 || d > 365) {
		sendJson(req, res, 400, { error: "days phải là số nguyên 1..365" });
		return null;
	}
	return d;
}
var BODY_CAP = 4096;
function readBody(req) {
	if (typeof req?.on !== "function") return Promise.resolve("");
	return new Promise((resolve) => {
		const chunks = [];
		let n = 0;
		req.on("data", (c) => {
			n += c.length;
			if (n > BODY_CAP) return resolve(null);
			chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", () => resolve(null));
	});
}
var windowChoices = [
	1,
	2,
	7,
	14,
	30,
	90,
	null
];
var settingsFile = () => path.join(process.env.OBSERVATORY_HOME ?? os.homedir(), ".observatory", "settings.json");
function readWindowDays() {
	try {
		const data = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
		return windowChoices.find((choice) => choice === data.windowDays);
	} catch {
		return;
	}
}
function writeWindowDays(days) {
	const file = settingsFile();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmp, JSON.stringify({ windowDays: days }));
		fs.renameSync(tmp, file);
	} catch (err) {
		try {
			fs.unlinkSync(tmp);
		} catch {}
		throw err;
	}
}
function applyWindowDays(ctx, days) {
	ctx.viewDays = days;
	ctx.index.setWindowDays(days);
	ctx.agyIndex?.setWindowDays(days);
	ctx.codexIndex?.setWindowDays(days);
}
function createApis(repoRoot, pools) {
	const savedDays = readWindowDays();
	const ctx = {
		repoRoot,
		artifactRoot: path.join(repoRoot, "docs", "artifact"),
		index: new TranscriptIndex(transcriptDir(repoRoot), Date.now, savedDays),
		agyIndex: new AgyTranscriptIndex(agyTranscriptDirs(), repoRoot, Date.now, savedDays, pools?.agy),
		codexIndex: new CodexTranscriptIndex(codexSessionDirs(), repoRoot, Date.now, savedDays, pools?.codex),
		viewDays: savedDays === void 0 ? 30 : savedDays,
		now: Date.now
	};
	const STATS_WRITE_MS = 6e5;
	let lastStatsWrite = 0;
	let marksCache = {
		at: 0,
		marks: []
	};
	const marks = () => {
		if (marksCache.at && ctx.now() - marksCache.at < STATS_WRITE_MS) return marksCache.marks;
		let out = [];
		try {
			out = [...new Set(execFileSync("git", [
				"-C",
				repoRoot,
				"log",
				"--format=%cs",
				"--",
				"apm.lock.yaml"
			], {
				encoding: "utf8",
				timeout: 5e3,
				stdio: [
					"ignore",
					"pipe",
					"ignore"
				]
			}).split(/\r?\n/).filter(Boolean))].sort();
		} catch {}
		marksCache = {
			at: ctx.now(),
			marks: out
		};
		return out;
	};
	const trend = () => {
		const evs = allEvents(ctx);
		const days = mergeStats(readStats(repoRoot), dailyStats(sourcesOf(ctx).flatMap((source) => source.sessionEvents()), [...evs]));
		if (ctx.now() - lastStatsWrite > STATS_WRITE_MS) try {
			writeStats(repoRoot, days);
			lastStatsWrite = ctx.now();
		} catch (err) {
			console.error(err);
		}
		return {
			days: days.slice(-90),
			marks: marks()
		};
	};
	const budget = (req, res) => {
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		if (req.method !== "GET") {
			res.statusCode = 405;
			return res.end(JSON.stringify({ error: "chỉ nhận GET" }));
		}
		(async () => {
			try {
				await refreshSources(sourcesOf(ctx));
				const [sub, query = ""] = (req.url ?? "/").split("?");
				if (sub === "/context") {
					const day = new URLSearchParams(query).get("day") ?? "";
					if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return sendJson(req, res, 400, { error: "day phải dạng YYYY-MM-DD" });
					const evs = allEvents(ctx);
					const sessions = daySessions(sourcesOf(ctx).flatMap((source) => source.sessionEvents()), linkSessions(evs, fs.existsSync(ctx.artifactRoot) ? listFolders(ctx.artifactRoot) : []), day);
					return sendJson(req, res, 200, {
						day,
						sessions,
						composition: composition(repoRoot),
						note: sessions.length ? "" : "Không có transcript cho ngày này (đã bị xoá hoặc chưa có phiên)."
					});
				}
				const cfg = readBudget(repoRoot);
				sendJson(req, res, 200, {
					lines: cfg ? budgetStatus(cfg, [...allEvents(ctx)], ctx.now()) : [],
					trend: trend()
				});
			} catch (err) {
				res.statusCode = 500;
				res.end(JSON.stringify({ error: String(err) }));
			}
		})().catch((err) => {
			res.statusCode = 500;
			res.end(JSON.stringify({ error: String(err) }));
		});
	};
	const missions = async (req, res) => {
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		try {
			await refreshSources(sourcesOf(ctx));
			const parts = (req.url ?? "/").split("?")[0].slice(1).split("/").map(decodeURIComponent);
			const [id, kind, name] = parts;
			if (parts.length === 2 && id === "board" && kind === "rebuild-index") {
				if (req.method !== "POST") {
					res.statusCode = 405;
					return res.end(JSON.stringify({ error: "chỉ nhận POST" }));
				}
				if (!sameOriginJson(req)) {
					res.statusCode = 403;
					return res.end(JSON.stringify({ error: "chỉ nhận yêu cầu JSON từ chính observatory" }));
				}
				try {
					const result = syncArtifactIndex(ctx.repoRoot);
					res.statusCode = 200;
					return res.end(JSON.stringify(result));
				} catch (err) {
					console.error(err);
					res.statusCode = 500;
					return res.end(JSON.stringify({ error: "Lỗi đồng bộ index" }));
				}
			}
			if (parts.length === 2 && kind === "state") {
				if (req.method !== "POST") {
					res.statusCode = 405;
					return res.end(JSON.stringify({ error: "chỉ nhận POST" }));
				}
				if (!sameOriginJson(req)) {
					res.statusCode = 403;
					return res.end(JSON.stringify({ error: "chỉ nhận yêu cầu JSON từ chính observatory" }));
				}
				const raw = await readBody(req);
				if (raw === null) {
					res.statusCode = 413;
					res.setHeader("Connection", "close");
					return res.end(JSON.stringify({ error: "body quá lớn" }), () => req.destroy?.());
				}
				let body;
				try {
					body = JSON.parse(raw);
				} catch {
					res.statusCode = 400;
					return res.end(JSON.stringify({ error: "JSON hỏng" }));
				}
				if (typeof body !== "object" || body === null) {
					res.statusCode = 400;
					return res.end(JSON.stringify({ error: "body không hợp lệ" }));
				}
				const { expectedColumn, target, confirmed } = body;
				if (typeof expectedColumn !== "string") {
					res.statusCode = 400;
					return res.end(JSON.stringify({ error: "thiếu expectedColumn" }));
				}
				if (target !== "done" && target !== "archived" && target !== null) {
					res.statusCode = 400;
					return res.end(JSON.stringify({ error: "target không hợp lệ" }));
				}
				if (!(fs.existsSync(ctx.artifactRoot) ? listFolders(ctx.artifactRoot) : []).includes(id)) {
					res.statusCode = 404;
					return res.end(JSON.stringify({ error: "không có mission này" }));
				}
				const curr = boardCard(ctx, id, boardGitFacts(ctx, id));
				if (curr.column !== expectedColumn) {
					res.statusCode = 409;
					return res.end(JSON.stringify({ error: "Cột nguồn đã thay đổi" }));
				}
				if ([
					"Inbox",
					"Ready",
					"Doing",
					"Blocked",
					"Chờ-user",
					"Review"
				].includes(curr.column)) {
					if (target !== "done" && target !== "archived") {
						res.statusCode = 400;
						return res.end(JSON.stringify({ error: "Chuyển giữa các cột tự tính hoặc target không hợp lệ" }));
					}
				} else if (curr.column === "Done") {
					if (target === "done") return sendJson(req, res, 200, curr);
					if (target !== "archived" && target !== null) {
						res.statusCode = 400;
						return res.end(JSON.stringify({ error: "target không hợp lệ từ cột Done" }));
					}
				} else if (curr.column === "Archived") {
					if (target === "archived") return sendJson(req, res, 200, curr);
					if (target !== "done" && target !== null) {
						res.statusCode = 400;
						return res.end(JSON.stringify({ error: "target không hợp lệ từ cột Archived" }));
					}
				} else {
					res.statusCode = 400;
					return res.end(JSON.stringify({ error: "Cột nguồn không hợp lệ" }));
				}
				if (listMissions(ctx).find((m) => m.id === id)?.live) {
					res.statusCode = 409;
					return res.end(JSON.stringify({ error: "Agent đang hoạt động trên mission này" }));
				}
				if (confirmed !== true) {
					res.statusCode = 400;
					return res.end(JSON.stringify({ error: "Yêu cầu xác nhận" }));
				}
				const intentPath = path.join(ctx.artifactRoot, id, "intent.md");
				if (!fs.existsSync(intentPath)) fs.writeFileSync(intentPath, "");
				try {
					writeFinalState(intentPath, target);
				} catch (err) {
					console.error(err);
					res.statusCode = 500;
					return res.end(JSON.stringify({ error: "Lỗi ghi trạng thái" }));
				}
				try {
					syncArtifactIndex(ctx.repoRoot);
				} catch (err) {
					console.error(err);
					res.statusCode = 500;
					return res.end(JSON.stringify({ error: "Lỗi đồng bộ index" }));
				}
				return sendJson(req, res, 200, boardCard(ctx, id, boardGitFacts(ctx, id)));
			}
			if (parts.length === 2 && kind === "export-summary") {
				if (req.method !== "POST") {
					res.statusCode = 405;
					return res.end(JSON.stringify({ error: "chỉ nhận POST" }));
				}
				if (!sameOriginJson(req)) {
					res.statusCode = 403;
					return res.end(JSON.stringify({ error: "chỉ nhận yêu cầu JSON từ chính observatory" }));
				}
				let result;
				try {
					result = exportSummary(ctx, id);
				} catch (err) {
					console.error(err);
					res.statusCode = 500;
					return res.end(JSON.stringify({ error: "xuất tổng kết thất bại" }));
				}
				if (!result) {
					res.statusCode = 404;
					return res.end(JSON.stringify({ error: "không có mission này" }));
				}
				res.statusCode = 200;
				return res.end(JSON.stringify(result));
			}
			if (req.method !== "GET") {
				res.statusCode = 405;
				return res.end(JSON.stringify({ error: "chỉ nhận GET" }));
			}
			if (parts.length === 1 && id === "board" || parts.length === 2 && id === "board" && parts[1] === "") return sendJson(req, res, 200, {
				cards: (fs.existsSync(ctx.artifactRoot) ? listFolders(ctx.artifactRoot) : []).map((f) => boardCard(ctx, f, boardGitFacts(ctx, f))),
				indexStale: !isArtifactIndexFresh(ctx.repoRoot)
			});
			if (parts.length > 1) {
				if (parts.length === 3 && kind === "event") {
					const input = name ? eventInput(ctx, id, name) : null;
					return input === null ? sendJson(req, res, 404, { error: "không có lời gọi này" }) : sendJson(req, res, 200, { input });
				}
				if (parts.length === 2 && kind === "activity") {
					const act = missionActivity(ctx, id);
					return sendJson(req, res, act ? 200 : 404, act ?? { error: "không có mission này" });
				}
				if (parts.length !== 3 || kind !== "doc") {
					res.statusCode = 404;
					return res.end(JSON.stringify({ error: "không có đường dẫn này" }));
				}
				const md = name ? readDoc(ctx, id, name) : null;
				if (md === null) {
					res.statusCode = 404;
					return res.end(JSON.stringify({ error: "không có tài liệu này" }));
				}
				res.setHeader("Content-Type", `${name.endsWith(".md") ? "text/markdown" : "text/plain"}; charset=utf-8`);
				return res.end(md);
			}
			const body = id ? missionDetail(ctx, id) : listMissions(ctx);
			sendJson(req, res, body ? 200 : 404, body ?? { error: "không có mission này" });
		} catch (err) {
			if (err instanceof URIError) {
				res.statusCode = 400;
				return res.end(JSON.stringify({ error: "id hỏng" }));
			}
			res.statusCode = 500;
			res.end(JSON.stringify({ error: String(err) }));
		}
	};
	const skills = (req, res) => {
		const days = getDays(req, res, 30);
		if (days === null) return;
		sendJson(req, res, 200, skillReport(repoRoot, days, ctx.now()));
	};
	const flows = (req, res) => {
		const days = getDays(req, res, 30);
		if (days === null) return;
		sendJson(req, res, 200, flowReport(repoRoot, days, ctx.now()));
	};
	const adapters = (req, res) => {
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		if (req.method !== "GET") {
			res.statusCode = 405;
			return res.end(JSON.stringify({ error: "chỉ nhận GET" }));
		}
		(async () => {
			try {
				await refreshSources(sourcesOf(ctx));
				sendJson(req, res, 200, { adapters: adapterStatuses(ctx) });
			} catch (err) {
				res.statusCode = 500;
				res.end(JSON.stringify({ error: String(err) }));
			}
		})().catch((err) => {
			res.statusCode = 500;
			res.end(JSON.stringify({ error: String(err) }));
		});
	};
	const window = (req, res) => {
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		if (req.method === "GET") return sendJson(req, res, 200, { days: ctx.viewDays });
		if (req.method !== "POST") return sendJson(req, res, 405, { error: "chỉ nhận GET, POST" });
		if (!sameOriginJson(req)) return sendJson(req, res, 403, { error: "chỉ nhận yêu cầu JSON từ chính observatory" });
		readBody(req).then((raw) => {
			if (raw === null) {
				res.statusCode = 413;
				res.setHeader("Connection", "close");
				res.end(JSON.stringify({ error: "body quá lớn" }), () => req.destroy());
				return;
			}
			let body;
			try {
				body = JSON.parse(raw);
			} catch {
				return sendJson(req, res, 400, { error: "JSON hỏng" });
			}
			const days = body && typeof body === "object" && !Array.isArray(body) ? body.days : void 0;
			if (!windowChoices.some((choice) => choice === days)) return sendJson(req, res, 400, { error: "days phải là 1, 2, 7, 14, 30, 90 hoặc null" });
			const selected = days;
			writeWindowDays(selected);
			applyWindowDays(ctx, selected);
			sendJson(req, res, 200, { days: ctx.viewDays });
		}).catch((err) => {
			console.error(err);
			sendJson(req, res, 500, { error: "Lỗi cập nhật cửa sổ" });
		});
	};
	const agents = (req, res) => {
		const days = getDays(req, res, 7);
		if (days === null) return;
		(async () => {
			try {
				await refreshSources(sourcesOf(ctx));
				const events = allEvents(ctx);
				const linked = linkSessions(events, fs.existsSync(ctx.artifactRoot) ? listFolders(ctx.artifactRoot) : []);
				sendJson(req, res, 200, agentReport([...events], linked, days, ctx.now(), declaredAgents(ctx.repoRoot)));
			} catch (err) {
				console.error(err);
				sendJson(req, res, 500, { error: "Lỗi thống kê agent" });
			}
		})().catch((err) => {
			console.error(err);
			sendJson(req, res, 500, { error: "Lỗi thống kê agent" });
		});
	};
	const roadmap = (req, res) => {
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		if (req.method !== "GET") return sendJson(req, res, 405, { error: "chỉ nhận GET" });
		sendJson(req, res, 200, roadmapReport(repoRoot));
	};
	const hoSo = (req, res) => {
		try {
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			if (req.method !== "GET") return sendJson(req, res, 405, { error: "chỉ nhận GET" });
			const url = new URL(req.url ?? "/", "http://x");
			if (url.pathname === "/") return sendJson(req, res, 200, {
				...hoSoReport(repoRoot),
				inbox: inboxHits(repoRoot)
			});
			if (url.pathname !== "/doc") return sendJson(req, res, 404, { error: "không có đường này" });
			const loai = url.searchParams.get("loai");
			if (loai !== "adr" && loai !== "c4" && loai !== "contract" && loai !== "thuat-ngu" && loai !== "ban-do-thuat-ngu") return sendJson(req, res, 400, { error: "loai không hợp lệ" });
			const text = readHoSoDoc(repoRoot, loai, url.searchParams.get("ten") ?? void 0);
			sendJson(req, res, text === null ? 404 : 200, text === null ? { error: "không có tài liệu này" } : { text });
		} catch (err) {
			console.error(err);
			sendJson(req, res, 500, { error: "không đọc được hồ sơ" });
		}
	};
	return {
		missions,
		budget,
		skills,
		flows,
		adapters,
		window,
		agents,
		roadmap,
		hoSo,
		ctx
	};
}
var META_TTL_MS = 3e4;
var execFileP = promisify(execFile);
var gitOut = async (p, args) => {
	try {
		return (await execFileP("git", [
			"-C",
			p,
			...args
		], {
			encoding: "utf8",
			timeout: 5e3
		})).stdout.trim();
	} catch {
		return null;
	}
};
var SUBJECT_MAX = 120;
function createRepoApis(startRepo, extras = []) {
	const start = startRepo === null ? null : path.resolve(startRepo);
	const repoRoots = () => listRepos(start, extras).map((r) => r.path);
	const pools = {
		agy: new AgyPool(agyTranscriptDirs(), repoRoots, Date.now, readWindowDays()),
		codex: new CodexPool(codexSessionDirs(), repoRoots, Date.now, readWindowDays())
	};
	const cache = /* @__PURE__ */ new Map();
	const pick = (kind) => (req, res, next) => {
		const [p, q = ""] = (req.url ?? "/").split("?");
		const sp = new URLSearchParams(q);
		const id = sp.get("repo");
		let repo = start;
		if (id !== null) {
			const found = resolveRepo(listRepos(start, extras), id);
			if (!found) {
				res.statusCode = 404;
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.end(JSON.stringify({ error: "không có repo này" }));
				return;
			}
			repo = found;
			sp.delete("repo");
			const rest = sp.toString();
			req.url = rest ? `${p}?${rest}` : p;
		} else if (repo === null) repo = listRepos(null, extras)[0]?.path ?? null;
		if (repo === null) {
			res.statusCode = 404;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
			res.end(JSON.stringify({ error: "chưa có dự án" }));
			return;
		}
		return apisOf(repo)[kind](req, res, next);
	};
	const apisOf = (repo) => {
		let apis = cache.get(repo);
		if (!apis) cache.set(repo, apis = createApis(repo, pools));
		else {
			const saved = readWindowDays();
			const days = saved === void 0 ? 30 : saved;
			if (apis.ctx.viewDays !== days) applyWindowDays(apis.ctx, days);
		}
		return apis;
	};
	const warm = () => {
		setImmediate(() => {
			(async () => {
				try {
					const repo = start ?? listRepos(null, extras)[0]?.path;
					if (repo) {
						const { ctx } = apisOf(repo);
						await refreshSources(sourcesOf(ctx));
						listMissions(ctx);
					}
				} catch (err) {
					if (err.code !== "ENOENT") console.error(err);
				}
			})().catch(console.error);
		});
	};
	const metaCache = /* @__PURE__ */ new Map();
	const metaOf = async (r) => {
		const hit = metaCache.get(r.id);
		if (hit && Date.now() - hit.at < META_TTL_MS) return hit.val;
		const [log, branch] = await Promise.all([gitOut(r.path, [
			"log",
			"-1",
			"--format=%h%x00%s%x00%cI"
		]), gitOut(r.path, [
			"rev-parse",
			"--abbrev-ref",
			"HEAD"
		])]);
		const parts = log?.split(String.fromCharCode(0));
		const val = {
			branch: branch || null,
			lastCommit: parts?.length === 3 ? {
				sha: parts[0],
				subject: parts[1].slice(0, SUBJECT_MAX),
				at: parts[2]
			} : null,
			missions: {
				total: 0,
				running: 0,
				waiting: 0
			},
			costToday: 0
		};
		try {
			const { ctx } = apisOf(r.path);
			await refreshSources(sourcesOf(ctx));
			const list = listMissions(ctx);
			val.missions = {
				total: list.length,
				running: list.filter((m) => m.live).length,
				waiting: list.filter((m) => m.flags.length > 0).length
			};
			const today = new Date(ctx.now()).toDateString();
			val.costToday = aggregateCost(allEvents(ctx).filter((e) => new Date(e.ts).toDateString() === today))?.costUsd ?? 0;
		} catch {}
		metaCache.set(r.id, {
			at: Date.now(),
			val
		});
		return val;
	};
	const repos = (req, res) => {
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		const fail = (status, error) => {
			res.statusCode = status;
			res.end(JSON.stringify({ error }));
		};
		const failWrite = (err) => {
			console.error(err);
			fail(500, "không ghi được danh sách dự án");
		};
		const list = listRepos(start, extras);
		const rest = (req.url ?? "/").split("?")[0].slice(1);
		if (req.method === "GET") {
			if (!rest) return sendJson(req, res, 200, {
				default: list[0]?.id ?? null,
				repos: list.map(({ id, label, kind, path }) => ({
					id,
					label,
					kind,
					path
				}))
			});
			if (rest !== "meta") return fail(404, "không có đường dẫn này");
			const only = new URLSearchParams((req.url ?? "").split("?")[1] ?? "").get("repo");
			const pickList = only === null ? list : list.filter((r) => r.id === only);
			if (only !== null && !pickList.length) return fail(404, "không có repo này");
			(async () => {
				const meta = {};
				for (const r of pickList) {
					meta[r.id] = await metaOf(r);
					await new Promise((ok) => setImmediate(ok));
				}
				sendJson(req, res, 200, { meta });
			})().catch(failWrite);
			return;
		}
		if (req.method !== "POST" && req.method !== "DELETE") return fail(405, "chỉ nhận GET, POST, DELETE");
		if (!sameOriginJson(req)) return fail(403, "chỉ nhận yêu cầu JSON từ chính observatory");
		if (req.method === "POST") {
			if (rest) return fail(404, "không có đường dẫn này");
			readBody(req).then((raw) => {
				if (raw === null) {
					res.statusCode = 413;
					res.setHeader("Connection", "close");
					res.end(JSON.stringify({ error: "body quá lớn" }), () => req.destroy());
					return;
				}
				let p;
				try {
					p = JSON.parse(raw)?.path;
				} catch {
					return fail(400, "JSON hỏng");
				}
				if (typeof p !== "string") return fail(400, "thiếu path (chuỗi)");
				const r = addRepo(p, list.map((x) => x.path));
				if (!r.ok) return fail(400, r.reason);
				res.statusCode = 201;
				res.end(JSON.stringify({ id: r.id }));
			}).catch(failWrite);
			return;
		}
		let id;
		try {
			id = decodeURIComponent(rest);
		} catch {
			return fail(400, "id hỏng");
		}
		const found = list.find((r) => r.id === id);
		if (!found) return fail(404, "không có repo này");
		if (found.kind !== "saved") return fail(403, "chỉ xoá được repo đã thêm qua giao diện");
		try {
			removeRepo(id);
		} catch (err) {
			return failWrite(err);
		}
		metaCache.delete(id);
		res.statusCode = 204;
		res.end();
	};
	const aggSkills = (req, res) => {
		const days = getDays(req, res, 30);
		if (days === null) return;
		const list = listRepos(start, extras);
		const reposOut = [];
		for (const r of list) try {
			const { ctx } = apisOf(r.path);
			const rep = skillReport(r.path, days, ctx.now());
			reposOut.push({
				id: r.id,
				name: r.label,
				report: rep
			});
		} catch (err) {
			reposOut.push({
				id: r.id,
				name: r.label,
				report: {
					repo: r.id,
					days,
					total: 0,
					skills: []
				},
				error: String(err).slice(0, 80)
			});
		}
		sendJson(req, res, 200, { repos: reposOut });
	};
	const aggFlows = (req, res) => {
		const days = getDays(req, res, 30);
		if (days === null) return;
		const list = listRepos(start, extras);
		const reposOut = [];
		for (const r of list) try {
			const { ctx } = apisOf(r.path);
			const rep = flowReport(r.path, days, ctx.now());
			reposOut.push({
				id: r.id,
				name: r.label,
				report: rep
			});
		} catch (err) {
			reposOut.push({
				id: r.id,
				name: r.label,
				report: {
					repo: r.id,
					days,
					tong: 0,
					theoLuong: [],
					khac: {},
					gate: {},
					gateTruotPct: null,
					drift: []
				},
				error: String(err).slice(0, 80)
			});
		}
		sendJson(req, res, 200, { repos: reposOut });
	};
	return {
		missions: pick("missions"),
		budget: pick("budget"),
		skills: pick("skills"),
		flows: pick("flows"),
		adapters: pick("adapters"),
		window: pick("window"),
		agents: pick("agents"),
		roadmap: pick("roadmap"),
		hoSo: pick("hoSo"),
		warm,
		aggSkills,
		aggFlows,
		repos
	};
}
//#endregion
//#region server/standalone.ts
var HOST = "127.0.0.1";
var DEFAULT_PORT = 5199;
var MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
	".map": "application/json; charset=utf-8"
};
function resolveStatic(distReal, urlPath) {
	let rel;
	try {
		rel = decodeURIComponent(urlPath);
	} catch {
		return null;
	}
	if (rel.includes("\0") || rel.split(/[\\/]/).includes("..")) return null;
	const file = path.resolve(distReal, `.${rel.startsWith("/") ? rel : `/${rel}`}`);
	try {
		const real = fs.realpathSync(file);
		if (real !== distReal && !real.startsWith(distReal + path.sep)) return null;
		return fs.statSync(real).isFile() ? real : null;
	} catch {
		return null;
	}
}
function serveFile(res, file, head) {
	res.statusCode = 200;
	res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.end(head ? void 0 : fs.readFileSync(file));
}
/** Khởi server; resolve khi đã nghe. Cổng bận → reject với lỗi code EADDRINUSE. */
function startServer(opts) {
	const [start, ...extras] = opts.repos ?? [opts.repoRoot ?? process.cwd()];
	const apis = createRepoApis(start ?? null, extras);
	const routes = [
		["/api/repos", apis.repos],
		["/api/missions", apis.missions],
		["/api/budget", apis.budget],
		["/api/window", apis.window],
		["/api/agents", apis.agents],
		["/api/roadmap", apis.roadmap],
		["/api/ho-so", apis.hoSo],
		["/api/agg/skills", apis.aggSkills],
		["/api/agg/flows", apis.aggFlows],
		["/api/skills", apis.skills],
		["/api/flows", apis.flows],
		["/api/adapters", apis.adapters]
	];
	const distReal = fs.existsSync(opts.distDir) ? fs.realpathSync(opts.distDir) : path.resolve(opts.distDir);
	const server = http.createServer((req, res) => {
		let blocked = true;
		hostGuard(() => server.address()?.port)(req, res, () => blocked = false);
		if (blocked) return;
		const url = req.url ?? "/";
		const pathname = url.split("?")[0];
		for (const [prefix, api] of routes) if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
			req.url = url.slice(prefix.length) || "/";
			return api(req, res);
		}
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.statusCode = 405;
			return res.end();
		}
		const head = req.method === "HEAD";
		const direct = resolveStatic(distReal, pathname === "/" ? "/index.html" : pathname);
		if (direct) return serveFile(res, direct, head);
		const index = !(pathname.split("/").pop() ?? "").includes(".") && !pathname.includes("%") ? resolveStatic(distReal, "/index.html") : null;
		if (index) return serveFile(res, index, head);
		res.statusCode = 404;
		res.end("Not found");
	});
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(opts.port ?? DEFAULT_PORT, HOST, () => {
			server.off("error", reject);
			apis.warm();
			resolve(server);
		});
	});
}
function parseArgs(argv) {
	const repos = [];
	let port = DEFAULT_PORT;
	for (let i = 0; i < argv.length; i++) if (argv[i] === "--repo" && argv[i + 1]) repos.push(argv[++i]);
	else if (argv[i] === "--port" && argv[i + 1]) port = Number(argv[++i]);
	if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Cổng không hợp lệ: ${port}`);
	return {
		repos: (repos.length ? repos : [process.cwd()]).map((r) => path.resolve(r)),
		port
	};
}
async function main() {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (err) {
		console.error(String(err.message));
		process.exit(1);
	}
	try {
		const addr = (await startServer({
			repos: args.repos,
			distDir: path.join(import.meta.dirname, "dist"),
			port: args.port
		})).address();
		const port = typeof addr === "object" && addr ? addr.port : args.port;
		console.log(`Observatory chạy tại http://${HOST}:${port}/ (repo: ${args.repos.join(", ")})`);
	} catch (err) {
		if (err.code === "EADDRINUSE") console.error(`Cổng ${args.port} đang bận — có thể Observatory đã chạy sẵn. Dùng --port <số khác> hoặc dừng tiến trình đang giữ cổng.`);
		else console.error(`Không khởi động được server: ${String(err)}`);
		process.exit(1);
	}
}
function isEntry() {
	if (!process.argv[1]) return false;
	try {
		const norm = (p) => process.platform === "win32" ? fs.realpathSync.native(p).toLowerCase() : fs.realpathSync(p);
		return norm(process.argv[1]) === norm(fileURLToPath(import.meta.url));
	} catch {
		return false;
	}
}
if (isEntry()) main();
//#endregion
export { parseArgs, startServer };
