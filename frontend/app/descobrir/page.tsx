"use client";

// A06·1 · Descobrir: ela escolhe quanto quer mergulhar agora, entre 5 faixas de esforço.
// Atende RF-F10.03 (issues #86 e #87). Usa os dados de teste de lib/descobrir.ts até a #89.

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Avatar } from "@/components/Avatar";
import { BandCard } from "@/components/BandCard";
import { BottomNav } from "@/components/BottomNav";
import { BANDS, bandPath, getDiscover, type BandGroup, type DiscoverData } from "@/lib/descobrir";
import styles from "./page.module.css";

const GROUP_LABELS: Record<Exclude<BandGroup, null>, string> = {
  sozinha: "Sozinha",
  "em-grupo": "Em grupo",
};

export default function DiscoverPage() {
  const [data, setData] = useState<DiscoverData | null>(null);

  useEffect(() => {
    let current = true;
    getDiscover().then((result) => {
      if (current) setData(result);
    });
    return () => {
      current = false;
    };
  }, []);

  return (
    <div className={styles.page}>
      <AppHeader>
        {data && (
          // O perfil ainda não existe; por enquanto o link dá 404.
          <Link href="/perfil" className={styles.profile} aria-label="Seu perfil">
            <Avatar name={data.firstName} size={36} />
          </Link>
        )}
      </AppHeader>

      <div className={styles.scroll}>
        <main className={styles.main}>
          {data ? (
            <Bands data={data} />
          ) : (
            // Provisório: a tela "Tecendo seu filé…" (E03) é da issue #81 e entra aqui quando existir.
            <p className={styles.status} aria-live="polite">
              Carregando…
            </p>
          )}
        </main>
      </div>

      <BottomNav active="descobrir" />
    </div>
  );
}

function Bands({ data }: { data: DiscoverData }) {
  return (
    <>
      <p className={styles.greeting}>Oi, {data.firstName}!</p>
      <h1 className={styles.title}>Quanto você quer mergulhar agora?</h1>
      <div className={styles.bands}>
        {data.bands.map((band, index) => {
          const info = BANDS[band.code];
          // O rótulo do grupo ("Sozinha", "Em grupo") vai antes da primeira faixa de cada grupo.
          const previousGroup = index > 0 ? BANDS[data.bands[index - 1].code].group : null;
          const label = info.group && info.group !== previousGroup ? GROUP_LABELS[info.group] : null;
          return (
            <div key={band.code} className={styles.band}>
              {label && <h2 className={styles.groupLabel}>{label}</h2>}
              <BandCard
                icon={info.icon}
                title={info.title}
                description={info.description}
                count={band.count}
                href={bandPath(band.code)}
                lastUsed={band.code === data.lastBand}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
