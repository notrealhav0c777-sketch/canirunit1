// Função serverless da Vercel. Requer a variável de ambiente ANTHROPIC_API_KEY.
const SYSTEM = `Você é o motor do site CAN I RUN IT?. Estime se jogos rodam em um dispositivo (PC, notebook ou celular) com base nas specs informadas.
Use a busca na web para checar requisitos oficiais e benchmarks. Nunca prometa FPS exato: dê faixas (ex: "50-70 FPS") e deixe claro que é uma estimativa.
Explique gargalos (CPU, GPU, RAM, VRAM, armazenamento, calor/throttling em notebook e celular).
Responda em português do Brasil e SOMENTE com JSON válido, sem markdown nem texto extra.`;

const SCHEMA_LIST = `Formato:
{"resumo":"string curta sobre o nível da máquina","gargalos":["..."],"jogos":[{"nome":"","veredito":"Roda bem | Roda no limite | Roda travando","fps":"faixa estimada","resolucao":"recomendada","config":"configurações gráficas sugeridas","obs":"opcional"}]}
Liste de 12 a 20 jogos populares e variados que rodam nesse dispositivo (para celular, jogos mobile). Não inclua jogos que não rodam.`;

const SCHEMA_GAME = `Formato:
{"nome":"nome correto do jogo","veredito":"Roda bem | Roda no limite | Roda travando | Não roda","fps":"faixa estimada","resolucao":"recomendada","config":"configurações sugeridas","explicacao":"explicação curta","gargalos":["..."]}`;

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada na Vercel.' });

  const { mode, tipo, specs, jogo } = req.body || {};
  if (!['pc', 'notebook', 'celular'].includes(tipo) || typeof specs !== 'object' || !specs) {
    return res.status(400).json({ error: 'Dados inválidos.' });
  }
  const clean = Object.fromEntries(Object.entries(specs).slice(0, 8).map(([k, v]) => [String(k).slice(0, 20), String(v).slice(0, 80)]));
  const prompt = mode === 'game'
    ? `Dispositivo (${tipo}): ${JSON.stringify(clean)}\nJogo: ${String(jogo || '').slice(0, 80)}\n${SCHEMA_GAME}`
    : `Dispositivo (${tipo}): ${JSON.stringify(clean)}\n${SCHEMA_LIST}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: SYSTEM,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || 'Erro na IA.' });
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < 0) return res.status(502).json({ error: 'A IA não retornou um resultado válido. Tente de novo.' });
    return res.status(200).json(JSON.parse(text.slice(a, b + 1)));
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao consultar a IA. Tente de novo.' });
  }
}
