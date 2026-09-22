// ============================================================
// DANFE com a cara da TopFood
//
// O @nfewizard/danfe nao aceita logo nem deixa mexer no
// espacamento das letras — os valores sao fixos no pacote. Em vez
// de editar node_modules (que o npm install desfaz), ajustamos o
// PDFKit por fora, so enquanto o PDF esta sendo gerado, e
// devolvemos tudo no lugar depois.
// ============================================================
const fs   = require('fs');
const path = require('path');

const LOGO = path.join(__dirname, '..', 'assets', 'logo-danfe.png');

// O pacote usa characterSpacing 0.5 a 1.5, o que deixa o texto esticado.
// 0.3 aperta sem encostar nas letras.
const FATOR_ESPACAMENTO = 0.3;

// Coordenadas do bloco do emitente, lidas do proprio pacote:
// caixa em (5.67, topo) com 197,5 de largura; nome em x=35 (width 170) e
// endereco em x=10 (width 181). Abrimos espaco a esquerda pro logo.
const LOGO_X = 9.5;
const LOGO_TAM = 42;
const TEXTO_X = 54;

async function gerarDanfe({ xml, chave, arquivo }) {
  const PDFDocument = require('pdfkit');
  const textoOriginal = PDFDocument.prototype.text;
  const temLogo = fs.existsSync(LOGO);

  PDFDocument.prototype.text = function (texto, x, y, options) {
    let opts = options;

    // Aperta o espacamento onde o pacote tiver definido um.
    if (opts && typeof opts.characterSpacing === 'number') {
      opts = Object.assign({}, opts, { characterSpacing: opts.characterSpacing * FATOR_ESPACAMENTO });
    }

    // Nome do emitente: reconhecido pela posicao que o pacote usa.
    // E dali que sai o topo da caixa, entao o logo se posiciona sozinho.
    if (temLogo && x === 35 && opts && opts.width === 170 && typeof y === 'number') {
      const topoCaixa = y - 14;
      try {
        this.image(LOGO, LOGO_X, topoCaixa + 26, { width: LOGO_TAM, height: LOGO_TAM });
      } catch (_) { /* logo e enfeite: se falhar, a nota sai mesmo assim */ }
      return textoOriginal.call(this, texto, TEXTO_X, y, Object.assign({}, opts, { width: 140 }));
    }

    // Endereco do emitente: acompanha o deslocamento do nome.
    if (temLogo && x === 10 && opts && opts.width === 181) {
      return textoOriginal.call(this, texto, TEXTO_X, y, Object.assign({}, opts, { width: 140 }));
    }

    return textoOriginal.call(this, texto, x, y, opts);
  };

  try {
    const { NFE_GerarDanfe } = require('@nfewizard/danfe');
    const r = await NFE_GerarDanfe({ data: xml, chave, outputPath: arquivo });
    // O PDF sai por stream: espera o arquivo existir com tamanho de verdade.
    for (let i = 0; i < 40; i++) {
      if (fs.existsSync(arquivo) && fs.statSync(arquivo).size > 1000) break;
      await new Promise(res => setTimeout(res, 250));
    }
    return r;
  } finally {
    PDFDocument.prototype.text = textoOriginal;
  }
}

module.exports = { gerarDanfe, LOGO };
