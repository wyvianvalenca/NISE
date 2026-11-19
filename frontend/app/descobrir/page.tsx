"use client";

// A06·1 · Descobrir: ela escolhe quanto quer mergulhar agora, entre 5 faixas de esforço.
// Atende RF-F10.03 (issues #86 e #87), pelas rotas da #88 (integração na #89).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Avatar } from "@/components/Avatar";
import { BandCard } from "@/components/BandCard";
import { BottomNav } from "@/components/BottomNav";
import { LoadFailed } from "@/components/LoadFailed";
import { TecendoFile } from "@/components/TecendoFile";
import {
  BANDS,
  bandPath,
  getDiscover,
  getFirstName,
  saveLastBand,
  type BandGroup,
  type DiscoverData,
  type DiscoverResult,
} from "@/lib/descobrir";
import { useLongWait } from "@/lib/loading";
import { SIGNUP_PATHS } from "@/lib/signup";
import { WITHOUT_SESSION } from "@/lib/signup-api";
import styles from "./page.module.css";

const GROUP_LABELS: Record<Exclude<BandGroup, null>, string> = {
  sozinha: "Sozinha",
  "em-grupo": "Em grupo",
};

/** Para onde ela vai quando a rota recusa: sem sessão, ou sem o aceite dos termos. */
function redirectFor(result: DiscoverResult | null): string | null {
  if (!result || result.ok) return null;
  if (result.reason === "terms_not_accepted") return SIGNUP_PATHS.terms;
  if (result.reason === "failed") return null;
  return WITHOUT_SESSION[result.reason];
}

// Uma falha vira erro, para useLongWait mostrar a E04 com "Tentar novamente".
// Fica fora do componente para ser sempre a mesma função: useLongWait recomeça
// a busca quando ela muda.
async function fetchDiscover(): Promise<DiscoverResult> {
  const result = await getDiscover();
  if (!result.ok && result.reason === "failed") {
    throw new Error("O Descobrir não carregou");
  }
  return result;
}

export default function DiscoverPage() {
  const router = useRouter();
  // Só para o "Quase lá, <nome>" da espera (E03), que aparece antes das contagens.
  const [waitName, setWaitName] = useState<string | null>(null);
  const { phase, data: result, retry } = useLongWait(fetchDiscover);
  const redirect = redirectFor(result);

  useEffect(() => {
    const controller = new AbortController();
    getFirstName(controller.signal).then(setWaitName, () => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  // A espera longa e a falha são as telas da #81 (E03 e E04).
  if (phase === "weaving") return <TecendoFile name={waitName} />;
  if (phase === "error") return <LoadFailed onRetry={retry} />;

  // Antes de 1 s não aparece nada no meio, para a tela não piscar.
  const data = result?.ok ? result.data : null;

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
        <main className={styles.main}>{data && <Bands data={data} />}</main>
      </div>

      <BottomNav active="descobrir" />
    </div>
  );
}

// Na volta de uma faixa, as contagens e a tag "da última vez" vêm da busca nova:
// useLongWait descarta os dados quando o Next esconde a tela (lib/loading.ts).
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
                // Grava a faixa para a tag "da última vez" da próxima visita (#88).
                onOpen={() => saveLastBand(band.code)}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
