const fs = require('fs');

const RSS_FEED_URL = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
const BLOG_ID = "1761503376493247689";
const LAST_LINK_FILE = 'last_link.txt';

// Dados de autenticação vindos dos segredos do GitHub
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

async function obterAccessToken() {
  const url = "https://googleapis.com";
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID || "",
      client_secret: CLIENT_SECRET || "",
      refresh_token: REFRESH_TOKEN || "",
      grant_type: "refresh_token"
    })
  });
  
  const textoResposta = await resposta.text();
  
  try {
    const dados = JSON.parse(textoResposta);
    if (!dados.access_token) {
      throw new Error("Resposta do Google sem access_token: " + textoResposta);
    }
    return dados.access_token;
  } catch (e) {
    throw new Error(`O Google rejeitou suas credenciais. Resposta bruta:\n${textoResposta}`);
  }
}

// Função auxiliar para extrair o conteúdo de tags XML via RegEx de forma segura
function extrairTag(texto, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i');
  const correspondencia = texto.match(regex);
  return correspondencia ? correspondencia[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '\$1').trim() : "";
}

async function run() {
  try {
    // 1. Baixar o Feed RSS do Google News como texto puro
    const respostaRss = await fetch(RSS_FEED_URL);
    const textoXml = await respostaRss.text();

    // 2. Isolar o primeiro bloco <item> do XML (a notícia mais recente)
    const itemMatch = textoXml.match(/<item[^>]*>([\s\(\S\)]*?)<\/item>/i);
    if (!itemMatch) {
      console.log("Nenhum item encontrado no feed RSS.");
      return;
    }
    const primeiroItemXml = itemMatch[1];

    // Extrair os dados usando nossa função customizada imune a bugs do '&'
    const titulo = extrairTag(primeiroItemXml, 'title');
    const link = extrairTag(primeiroItemXml, 'link');
    const descricao = extrairTag(primeiroItemXml, 'description');

    if (!link) {
      console.log("Não foi possível extrair o link da notícia.");
      return;
    }

    // 3. Controlar duplicidade localmente no GitHub
    let ultimoLinkPostado = '';
    if (fs.existsSync(LAST_LINK_FILE)) {
      ultimoLinkPostado = fs.readFileSync(LAST_LINK_FILE, 'utf8').trim();
    }

    if (ultimoLinkPostado === link) {
      console.log("A notícia mais recente já foi publicada anteriormente.");
      return;
    }

    // 4. Pegar o Access Token temporário do Google
    const accessToken = await obterAccessToken();

    // 5. Estruturar o post em HTML
    const corpoPostHtml = `
      <div>${descricao}</div>
      <br />
      <p><em>Read the full story on Google News: <a href="${link}" target="_blank">Click here</a></em></p>
    `;

    // 6. Enviar para a API do Blogger
    const apiUrl = `https://googleapis.com{BLOG_ID}/posts/`;
    
    const respostaBlogger = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: titulo,
        content: corpoPostHtml
      })
    });

    if (respostaBlogger.status === 200 || respostaBlogger.status === 201) {
      console.log(`Sucesso! Post "${titulo}" publicado.`);
      fs.writeFileSync(LAST_LINK_FILE, link, 'utf8');
    } else {
      const erroTexto = await respostaBlogger.text();
      console.error(`Erro na API do Blogger (Status ${respostaBlogger.status}):`, erroTexto);
    }

  } catch (error) {
    console.error("Erro crítico na execução:", error.message || error);
    process.exit(1);
  }
}

run();
