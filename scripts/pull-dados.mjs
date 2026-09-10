/**
 * Trilho Educacional — Robô de atualização de dados
 * -------------------------------------------------
 * Puxa os KPIs do Meta (3 unidades, janelas de 7/15/30 dias) e o total de
 * leads qualificados da planilha do Google, e grava tudo em `dados.json`.
 *
 * Roda no GitHub Actions (agendado). Precisa de dois segredos:
 *   META_TOKEN       — token de longa duração (System User) da Business
 *                      "Trilho Educacional", com permissão ads_read.
 *   SHEETS_API_KEY   — chave da API do Google Sheets (planilha compartilhada
 *                      como "qualquer pessoa com o link pode ver").
 *
 * As matrículas/metas anuais vêm dos PDFs (entrada manual) — ficam no bloco
 * MATRICULAS abaixo; atualize aqui quando chegar um PDF novo.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const TOKEN = process.env.META_TOKEN;
const SHEETS_KEY = process.env.SHEETS_API_KEY;
const SHEET_ID = "1uBpVKOp2m5Zw-kd2k_zGPKiCbdvxZPLWUcfbBO9EkRw";
const CONVERSA = "onsite_conversion.messaging_conversation_started_7d";

// Unidade -> conta de anúncio, página e aba da planilha de leads
const UNIDADES = [
  { key: "centro", name: "Antenor Thomazi", act: "334749172316061",  page: "1403353129879506", aba: "CECAT"   },
  { key: "sul",    name: "Anjinho",          act: "315522727529188",  page: "110898225221191",  aba: "ANJINHO" },
  { key: "barra",  name: "Aquas",            act: "1245240652806683", page: "402482996539606",  aba: "AQUAS"   },
];

// Matrículas 2027 (dos PDFs — atualize quando chegar relatório novo)
const MATRICULAS = {
  centro: { metaAnual: 340, atingidoAnual: 76, novosMeta: 71, novosFeito: 0 },
  sul:    { metaAnual: 360, atingidoAnual: 93, novosMeta: 88, novosFeito: 12 },
  barra:  { metaAnual: 230, atingidoAnual: 26, novosMeta: 56, novosFeito: 1 },
};

const dia = d => d.toISOString().slice(0, 10);
function janela(dias) {
  const hoje = new Date();
  const ini = new Date(hoje); ini.setUTCDate(ini.getUTCDate() - (dias - 1));
  return JSON.stringify({ since: dia(ini), until: dia(hoje) });
}
function fmtDe(nome) {
  const n = (nome || "").toUpperCase();
  if (n.includes("REEL")) return "Reels";
  if (n.includes("VÍDEO") || n.includes("VIDEO")) return "Vídeo";
  if (n.includes("CARROSSEL") || n.includes("CARROUSEL")) return "Carrossel";
  return "Feed";
}
async function graph(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function paginar(url) {
  let out = [];
  while (url) {
    const j = await graph(url);
    out = out.concat(j.data || []);
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return out;
}

async function anunciosDaConta(act) {
  const url = `${GRAPH}/act_${act}/ads?fields=id,name,effective_status,adset{name}&limit=500&access_token=${TOKEN}`;
  const ads = await paginar(url);
  const map = {};
  for (const a of ads) {
    map[a.id] = {
      name: a.name,
      status: a.effective_status === "ACTIVE" ? "ativo" : "pausado",
      adset: a.adset && a.adset.name ? a.adset.name : null,
      fmt: fmtDe(a.name),
    };
  }
  return map;
}

async function insightsJanela(act, dias) {
  const url = `${GRAPH}/act_${act}/insights?level=ad&fields=ad_id,spend,impressions,actions,cost_per_action_type&time_range=${encodeURIComponent(janela(dias))}&limit=1000&access_token=${TOKEN}`;
  const rows = await paginar(url);
  const out = {};
  for (const r of rows) {
    const spend = parseFloat(r.spend || "0");
    if (!(spend > 0)) continue;
    const conv = (r.actions || []).find(a => a.action_type === CONVERSA);
    const custo = (r.cost_per_action_type || []).find(a => a.action_type === CONVERSA);
    out[r.ad_id] = {
      conversas: conv ? parseInt(conv.value, 10) : 0,
      custo: custo ? parseFloat(custo.value) : 0,
      investido: spend,
    };
  }
  return out;
}

async function unidadeMeta(u) {
  const ads = await anunciosDaConta(u.act);
  const periods = {};
  for (const dias of [7, 15, 30]) {
    const ins = await insightsJanela(u.act, dias);
    const lista = Object.entries(ins).map(([adId, m], i) => {
      const meta = ads[adId] || {};
      const pub = meta.adset ? [`Conjunto: ${meta.adset}`] : ["Público — conjunto de anúncios"];
      return {
        id: adId,
        name: meta.name || "Anúncio",
        fmt: meta.fmt || "Feed",
        conversas: m.conversas,
        semana: m.conversas,
        custo: +m.custo.toFixed(2),
        status: meta.status || "pausado",
        publico: pub,
        th: i % 6,
      };
    }).sort((a, b) => b.conversas - a.conversas);
    periods[dias] = lista;
  }
  return periods;
}

async function lerLeads() {
  const leads = { atualizado: "" };
  if (!SHEETS_KEY) { for (const u of UNIDADES) leads[u.key] = 0; return leads; }
  for (const u of UNIDADES) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${u.aba}!B2:D2?key=${SHEETS_KEY}`;
      const j = await graph(url);
      const row = (j.values && j.values[0]) || [];
      leads[u.key] = parseInt(row[0] || "0", 10) || 0;
      if (row[2]) leads.atualizado = String(row[2]).slice(0, 5); // dd/mm
    } catch (e) { leads[u.key] = 0; console.error(`Leads ${u.aba}:`, e.message); }
  }
  return leads;
}

async function main() {
  if (!TOKEN) throw new Error("META_TOKEN ausente");
  const unidades = {};
  for (const u of UNIDADES) {
    try {
      const periods = await unidadeMeta(u);
      unidades[u.key] = { name: u.name, page: u.page, periods, ...MATRICULAS[u.key] };
      console.log(`OK ${u.name}: 30d=${periods[30].length} criativos`);
    } catch (e) {
      console.error(`FALHA ${u.name}:`, e.message);
      unidades[u.key] = { name: u.name, page: u.page, periods: { 7: [], 15: [], 30: [] }, erro: e.message, ...MATRICULAS[u.key] };
    }
  }
  const leads = await lerLeads();
  const dados = { atualizadoEm: new Date().toISOString(), unidades, leads };
  const fs = await import("node:fs/promises");
  await fs.writeFile("dados.json", JSON.stringify(dados, null, 2));
  console.log("dados.json gravado.");
}

main().catch(e => { console.error(e); process.exit(1); });
