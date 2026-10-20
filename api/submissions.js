function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function createdAtTimestamp(submission) {
  const createdAt = submission && submission.created_at;
  if (typeof createdAt !== "string") {
    return Number.NEGATIVE_INFINITY;
  }

  const normalized = createdAt.replace(" ", "T");
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const timestamp = Date.parse(hasTimezone ? normalized : `${normalized}Z`);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const formID = req.query && req.query.formID;
  if (typeof formID !== "string" || !/^\d+$/.test(formID)) {
    return res.status(400).json({ error: "formID inválido." });
  }

  const apiKey = process.env.JOTFORM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Configuração do servidor indisponível." });
  }

  const url = new URL(`https://eu-api.jotform.com/form/${formID}/submissions`);
  url.searchParams.set("orderby", "created_at");
  url.searchParams.set("direction", "DESC");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, {
      headers: {
        APIKEY: apiKey
      }
    });

    if (!response.ok) {
      const status = response.status === 429 ? 503 : 502;
      return res.status(status).json({ error: "Erro ao consultar a API da Jotform." });
    }

    const data = await response.json();
    const submissions = Array.isArray(data.content) ? data.content : [];
    const latest = submissions.reduce((current, submission) => {
      if (!current || createdAtTimestamp(submission) > createdAtTimestamp(current)) {
        return submission;
      }
      return current;
    }, null);

    if (!latest) {
      return res.status(200).json({ submission: null });
    }

    return res.status(200).json({
      submission: {
        id: latest.id,
        created_at: latest.created_at,
        answers: latest.answers || {}
      }
    });
  } catch (error) {
    return res.status(502).json({ error: "Erro ao consultar a API da Jotform." });
  }
}
