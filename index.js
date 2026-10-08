const fs = require('fs');

const RSS_FEED_URL = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
const BLOG_ID = "1761503376493247689";
const LAST_LINK_FILE = 'last_link.txt';

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

function extrairTag(texto, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const correspondencia = texto.match(regex);
  if (!correspondencia) return "";
  // Limpa blocos CDATA se existirem
  return correspondencia[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '\$1').trim();
}

async function run() {
  try {
    console.log("Iniciando a busca no feed RSS...");
    const respostaRss = await fetch(RSS_FEED_URL);
    const textoXml = await respostaRss.text();

    // Isolar o primeiro bloco <item>
    const itemMatch = textoXml.match(/<item[^>]*>([\s\(\S\)]*?)<\/item>/i);
    if (!itemMatch) {
      console.log("Aviso: Nenhum item <item> foi encontrado no XML do feed.");
      return;
    }
    
    // CORREÇÃO: Pega o grupo capturado [1] em vez do array completo [0]
    const primeiroItemXml = itemMatch[1];

    const titulo = extrairTag(primeiroItemXml, 'title');
    const link = extrairTag(primeiroItemXml, 'link');
    const descricao = extrairTag(primeiroItemXml, 'description');

    console.log(`Notícia identificada:\nTítulo: ${titulo}\nLink: ${link}`);

    if (!link) {
      console.log("Aviso: Não foi possível extrair a URL de dentro da tag <link>.");
      return;
    }

    let ultimoLinkPostado = '';
    if (fs.existsSync(LAST_LINK_FILE)) {
      ultimoLinkPostado = fs.readFileSync(LAST_LINK_FILE, 'utf8').trim();
    }

    if (ultimoLinkPostado === link) {
      console.log("Bloqueio Anti-Duplicidade: Esta notícia já foi publicada na rodada anterior.");
      return;
    }

    console.log("Renovando token de acesso do Google...");
    const accessToken = await obterAccessToken();

    const corpoPostHtml = `
      <div>${descricao}</div>
      <br />
      <p><em>Read the full story on Google News: <a href="${link}" target="_blank">Click here</a></em></p>
    `;

    console.log("Enviando postagem para o Blogger...");
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
      console.log(`Sucesso Total! Post "${titulo}" publicado no Blogger.`);
      fs.writeFileSync(LAST_LINK_FILE, link, 'utf8');
      console.log("Arquivo last_link.txt atualizado com o novo link.");
    } else {
      const erroTexto = await respostaBlogger.text();
      console.error(`Erro retornado pela API do Blogger (Status ${respostaBlogger.status}):`, erroTexto);
    }

  } catch (error) {
    console.error("Erro crítico na execução:", error.message || error);
    process.exit(1);
  }
}

run();
