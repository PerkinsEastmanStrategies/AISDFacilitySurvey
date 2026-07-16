"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  SURVEY_QUESTIONS,
  PRIORITIZATION_CATEGORIES,
  MAX_PRIORITIES,
  DONT_KNOW_RATING,
  NA_RATING,
  formatRatingDisplay,
  isFacilityConditionQuestion,
  type QuestionResponse,
} from "@/lib/survey-data";
import { CategoryRanking } from "./category-ranking";

const EXPLANATION_PLACEHOLDER_TOOLS_ABOVE =
  "Please explain your rating. Please use the annotation tools above to mark specific areas on the floor plan or site map.";

const EXPLANATION_PLACEHOLDER_TOOLS_BELOW =
  "Please explain your rating. Please use the annotation tools below to mark specific areas on the floor plan or site map.";

export type QuestionFormParts = "full" | "prompt-rating" | "explanation";

interface QuestionFormProps {
  questionId: number;
  response: QuestionResponse;
  onChange: (response: QuestionResponse) => void;
  /**
   * Compact mode is used when several questions of the same category are shown
   * together in one panel. It drops the large section/category header (shown
   * once by the parent panel) and tightens spacing.
   */
  compact?: boolean;
  /**
   * Split rating questions so annotation tools can sit between the 1–5 scale
   * and the explanation box: `prompt-rating` then tools then `explanation`.
   */
  parts?: QuestionFormParts;
  /**
   * When the parent panel already shows section + category, skip the duplicate
   * meta header and lead with the statement text.
   */
  omitMetaHeader?: boolean;
  /** Mark open-ended text responses as required (e.g. Safety priorities). */
  textRequired?: boolean;
  /** Where Mark Locations sits relative to the explanation for guide copy. */
  annotationToolsPosition?: "above" | "below";
}

export function QuestionForm({
  questionId,
  response,
  onChange,
  compact = false,
  parts = "full",
  omitMetaHeader = false,
  textRequired = false,
  annotationToolsPosition = "above",
}: QuestionFormProps) {
  const question = SURVEY_QUESTIONS.find((q) => q.id === questionId);
  const safeResponse = response ?? {
    questionId,
    rating: 0,
    explanation: "",
  };

  if (!question) return null;

  const explanationPlaceholder =
    annotationToolsPosition === "below"
      ? EXPLANATION_PLACEHOLDER_TOOLS_BELOW
      : EXPLANATION_PLACEHOLDER_TOOLS_ABOVE;

  const requiredMark = (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );

  const isFca = isFacilityConditionQuestion(question);
  const questionCode = "questionCode" in question ? question.questionCode : undefined;
  const tip = "tip" in question && typeof question.tip === "string" ? question.tip : undefined;
  const area = "area" in question ? question.area : undefined;

  const getRatingLabel = (rating: number) => {
    if (rating === 0) return "Select a rating";
    return formatRatingDisplay(rating, question.section);
  };

  const getRatingColor = (rating: number) => {
    if (rating === DONT_KNOW_RATING || rating === NA_RATING) return "bg-slate-500";
    switch (rating) {
      case 1:
        return "bg-red-500";
      case 2:
        return "bg-orange-500";
      case 3:
        return "bg-yellow-500";
      case 4:
        return "bg-lime-500";
      case 5:
        return "bg-green-500";
      default:
        return "bg-gray-300";
    }
  };

  const renderRatingButtons = (size: "sm" | "md" = "sm") => {
    const buttonClass =
      size === "sm"
        ? "flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold transition-all"
        : "flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-semibold transition-all";

    return (
      <div className="flex flex-wrap items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onChange({ ...safeResponse, rating: num })}
            className={`${buttonClass} ${
              safeResponse.rating === num
                ? `${getRatingColor(num)} text-white scale-105 shadow-sm`
                : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
            }`}
          >
            {num}
          </button>
        ))}
        {isFca && (
          <>
            <button
              type="button"
              data-tour="fca-na"
              onClick={() => onChange({ ...safeResponse, rating: NA_RATING })}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${
                safeResponse.rating === NA_RATING
                  ? "bg-slate-600 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
              }`}
            >
              N/A
            </button>
            <button
              type="button"
              data-tour="fca-dont-know"
              onClick={() => onChange({ ...safeResponse, rating: DONT_KNOW_RATING })}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${
                safeResponse.rating === DONT_KNOW_RATING
                  ? "bg-slate-600 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
              }`}
            >
              I don&apos;t know
            </button>
          </>
        )}
      </div>
    );
  };

  const renderExplanationField = (opts?: {
    compact?: boolean;
    showQuestionHint?: boolean;
  }) => (
    <div className="space-y-1" data-tour="explanation">
      <Label
        htmlFor={`explanation-${questionId}`}
        className="text-[11px] font-medium text-foreground"
      >
        Please explain your rating{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
        {opts?.showQuestionHint && (area || questionCode) ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            ({[questionCode, area].filter(Boolean).join(" · ")})
          </span>
        ) : null}
      </Label>
      <Textarea
        id={`explanation-${questionId}`}
        value={safeResponse.explanation}
        onChange={(e) =>
          onChange({ ...safeResponse, explanation: e.target.value })
        }
        placeholder={explanationPlaceholder}
        rows={opts?.compact ? 1 : 2}
        className={
          opts?.compact
            ? "min-h-7 resize-none px-1.5 py-1 text-[10px] md:text-[10px]"
            : "resize-none text-[10px] md:text-[10px]"
        }
      />
    </div>
  );

  // Compact / full split: explanation-only block (after Mark Locations).
  if (parts === "explanation" && question.type === "rating") {
    if (compact) {
      return (
        <div className="rounded-md border border-border/60 bg-card p-2 shadow-sm">
          {renderExplanationField({ compact: true, showQuestionHint: true })}
        </div>
      );
    }
    return (
      <div className="rounded-md border border-border/60 bg-card p-2.5 shadow-sm">
        {renderExplanationField()}
      </div>
    );
  }

  if (compact && question.type === "rating") {
    return (
      <div className="rounded-md border border-border/60 bg-card p-2 shadow-sm">
        <div className="flex items-start gap-1">
          {questionCode && (
            <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-semibold text-muted-foreground">
              {questionCode}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {area && (
              <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {area}
              </p>
            )}
            <p className="mt-px text-[11px] font-semibold leading-snug text-foreground">
              {question.text}
            </p>
            {tip && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground/80">Tip: </span>
                {tip}
              </p>
            )}
          </div>
        </div>

        <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between" data-tour="rating">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] font-medium text-foreground">
              Rating {requiredMark}
            </Label>
            {renderRatingButtons("sm")}
          </div>
          <span className="text-[9px] font-medium text-muted-foreground sm:text-right">
            {getRatingLabel(safeResponse.rating)}
          </span>
        </div>

        {parts === "full" && (
          <div className="mt-1.5">
            {renderExplanationField({ compact: true })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="gap-2 border-border/60 py-2.5 shadow-sm">
      {(parts === "full" || parts === "prompt-rating") &&
        !(omitMetaHeader && question.type === "text") && (
        <CardHeader className="px-2.5 pb-1.5">
          {!omitMetaHeader && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {question.section}
                </span>
              </div>
              <div className="mt-px flex items-center gap-1">
                <Badge
                  variant="secondary"
                  className="px-1.5 py-px text-[9px]"
                >
                  {question.category}
                </Badge>
                {questionCode && (
                  <Badge variant="outline" className="font-mono text-[9px]">
                    {questionCode}
                  </Badge>
                )}
              </div>
            </>
          )}
          <CardTitle
            className={`font-sans text-xs font-bold leading-snug text-foreground ${
              omitMetaHeader ? "" : "mt-1"
            }`}
          >
            {question.text}
          </CardTitle>
          {tip && (
            <p className="mt-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
              <span className="font-semibold text-foreground">Tip: </span>
              {tip}
            </p>
          )}
        </CardHeader>
      )}
      <CardContent className="space-y-3 px-2.5">
        {question.type === "ranking" ? (
          <div className="space-y-1.5" data-tour="ranking">
            <Label className="text-[11px] font-medium text-foreground">
              Rank your top {MAX_PRIORITIES} priorities{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Select categories in order of priority (first selected = highest).
              Options match the Educational Suitability topic areas above.
            </p>
            <CategoryRanking
              categories={PRIORITIZATION_CATEGORIES}
              value={safeResponse.ranking}
              onChange={(ranking) => onChange({ ...safeResponse, ranking })}
            />
            <div className="space-y-1 pt-1">
              <Label
                htmlFor="ranking-context"
                className="text-[11px] font-medium text-foreground"
              >
                Additional context (optional)
              </Label>
              <Textarea
                id="ranking-context"
                value={safeResponse.explanation}
                onChange={(e) =>
                  onChange({ ...safeResponse, explanation: e.target.value })
                }
                placeholder="Add any notes about these modernization priorities…"
                rows={2}
                className="resize-none text-[10px] md:text-[10px]"
              />
            </div>
          </div>
        ) : question.type === "text" ? (
          <div className="space-y-1">
            <Label htmlFor="open-response" className="text-[11px] font-medium text-foreground">
              Your response{" "}
              {textRequired ? (
                requiredMark
              ) : (
                <span className="font-normal text-muted-foreground">(optional)</span>
              )}
            </Label>
            <Textarea
              id="open-response"
              value={safeResponse.explanation}
              onChange={(e) =>
                onChange({ ...safeResponse, explanation: e.target.value })
              }
              placeholder={
                textRequired && question.id === 17
                  ? "List your top 3 safety and security priorities…"
                  : "Type your response..."
              }
              rows={3}
              required={textRequired}
              aria-required={textRequired}
              className="resize-none text-[10px] md:text-[10px]"
            />
          </div>
        ) : (
          <>
            {(parts === "full" || parts === "prompt-rating") && (
              <div className="space-y-2" data-tour="rating">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-foreground">
                    Rating {requiredMark}
                  </Label>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {getRatingLabel(safeResponse.rating)}
                  </span>
                </div>

                <p className="text-[9px] text-muted-foreground">
                  1 = Strongly Disagree · 3 = Neutral · 5 = Strongly Agree
                </p>
                <div className="flex justify-center">{renderRatingButtons("md")}</div>
              </div>
            )}

            {(parts === "full" || parts === "explanation") &&
              renderExplanationField()}
          </>
        )}
      </CardContent>
    </Card>
  );
}
