"use client";

// Pergunta do curso da A18 (pergunta 3, RF-F6.02, issue #294). Fica num
// componente para o perfil (#298) e a pergunta "Mudei de curso" (#299)
// usarem a mesma escolha de nível, curso e lugar.

import { Chip, ChipGroup } from "@/components/Chip";
import { Field } from "@/components/Field";
import {
  type CourseAnswer,
  type CourseCode,
  type CourseStatus,
  type FollowupOptionsOut,
  enteredCourse,
} from "@/lib/caminho";
import styles from "./CourseQuestion.module.css";

type CourseQuestionProps = {
  /** O texto da pergunta, que rotula as escolhas do nível. */
  legend: string;
  firstName: string;
  options: Pick<FollowupOptionsOut, "courseStatuses" | "courses">;
  value: CourseAnswer;
  onChange: (value: CourseAnswer) => void;
  /** Só técnico e graduação, sem "Tô tentando entrar" nem "Ainda não" (ao mudar de curso). */
  levelsOnly?: boolean;
};

/**
 * Escolhe entre curso técnico, graduação, "Tô tentando entrar" e "Ainda não".
 * Quem entrou diz qual curso e, se quiser, onde. Trocar para uma resposta sem
 * curso descarta o que ela tinha escolhido: só vale o que está marcado ao
 * enviar.
 */
export function CourseQuestion({
  legend,
  firstName,
  options,
  value,
  onChange,
  levelsOnly = false,
}: CourseQuestionProps) {
  const entered = enteredCourse(value.courseStatus);
  const statuses = levelsOnly
    ? options.courseStatuses.filter((option) => enteredCourse(option.code as CourseStatus))
    : options.courseStatuses;

  function chooseStatus(code: CourseStatus) {
    if (value.courseStatus === code) {
      onChange({ courseStatus: null, course: null, otherCourse: "", institution: "" });
    } else if (enteredCourse(code)) {
      onChange({ ...value, courseStatus: code });
    } else {
      onChange({ courseStatus: code, course: null, otherCourse: "", institution: "" });
    }
  }

  return (
    <div className={styles.question}>
      <ChipGroup label={legend}>
        {statuses.map((option) => (
          <Chip
            key={option.code}
            size="lg"
            selected={value.courseStatus === option.code}
            onClick={() => chooseStatus(option.code as CourseStatus)}
          >
            {option.label}
          </Chip>
        ))}
      </ChipGroup>

      {entered && (
        <>
          <p className={styles.congrats}>
            {firstName ? `Que demais! Parabéns, ${firstName}!` : "Que demais! Parabéns!"}
          </p>

          <ChipGroup label="Qual curso?">
            {options.courses.map((option) => (
              <Chip
                key={option.code}
                size="lg"
                selected={value.course === option.code}
                onClick={() =>
                  onChange({
                    ...value,
                    course: option.code as CourseCode,
                    // O nome digitado só vale para "Outro curso".
                    otherCourse: option.code === "outro" ? value.otherCourse : "",
                  })
                }
              >
                {option.label}
              </Chip>
            ))}
          </ChipGroup>

          {value.course === "outro" && (
            <Field
              label="Qual o nome do curso?"
              maxLength={120}
              defaultValue={value.otherCourse}
              onValueChange={(otherCourse) => onChange({ ...value, otherCourse })}
            />
          )}

          <Field
            label="Onde?"
            optional
            maxLength={120}
            defaultValue={value.institution}
            onValueChange={(institution) => onChange({ ...value, institution })}
          />
        </>
      )}
    </div>
  );
}
