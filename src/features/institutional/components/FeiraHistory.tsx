const editions = [
  { year: 2016, description: "Desfile e público na primeira edição da New Wed Feira" },
  { year: 2017, description: "Encontro de noivos e fornecedores na New Wed Feira de 2017" },
  { year: 2018, description: "Decoração e espaços dos expositores na New Wed Feira de 2018" },
  { year: 2019, description: "Público e expositores na New Wed Feira de 2019" },
];

export function FeiraHistory() {
  return (
    <section className="nw-detail-section nw-fair-history" id="edicoes-anteriores" aria-labelledby="fair-history-title">
      <p className="nw-eyebrow">Nossa história em encontros</p>
      <h2 id="fair-history-title">Inspirações que atravessam as edições.</h2>
      <p className="nw-history-intro">Desde 2016, a New Wed Feira reúne tendências, profissionais e histórias de quem faz o mercado de casamentos. Relembre alguns desses encontros.</p>
      <div className="nw-fair-mosaic">
        {editions.map(({ year, description }) => (
          <figure key={year}>
            <a href={`/assets/feira/edicao-${year}.webp`} target="_blank" rel="noopener noreferrer" aria-label={`Ampliar foto da Feira ${year} (nova aba)`}>
              <img src={`/assets/feira/edicao-${year}.webp`} alt={description} width={500} height={year === 2016 || year === 2019 ? 750 : 500} loading="lazy" />
            </a>
            <figcaption>New Wed Feira <strong>{year}</strong></figcaption>
          </figure>
        ))}
      </div>
      <div className="nw-history-video">
        <iframe src="https://www.youtube-nocookie.com/embed/xhentgAI9pU" title="New Wed Feira Tendência 2019 — vídeo oficial" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <p className="nw-video-caption">Reviva a New Wed Feira Tendência 2019.</p>
    </section>
  );
}
