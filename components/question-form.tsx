"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  SURVEY_QUESTIONS,
  PRIORITIZATION_CATEGORIES,
  DONT_KNOW_RATING,
  formatRatingDisplay,
  isFacilityConditionQuestion,
  type QuestionResponse,
} from "@/lib/survey-data";
import { CategoryRanking } from "./category-ranking";

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
}

export function QuestionForm({ questionId, response, onChange, compact = false }: QuestionFormProps) {
  const question = SURVEY_QUESTIONS.find((q) => q.id === questionId);

  if (!question) return null;

  const isFca = isFacilityConditionQuestion(question);
  const questionCode = "questionCode" in question ? question.questionCode : undefined;
  const tip = "tip" in question && typeof question.tip === "string" ? question.tip : undefined;

  const getRatingLabel = (rating: number) => {
    if (rating === 0) return "Select a rating";
    return formatRatingDisplay(rating, question.section);
  };

  const getRatingColor = (rating: number) => {
    if (rating === DONT_KNOW_RATING) return "bg-slate-500";
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
            onClick={() => onChange({ ...response, rating: num })}
            className={`${buttonClass} ${
              response.rating === num
                ? `${getRatingColor(num)} text-white scale-105 shadow-sm`
                : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
            }`}
          >
            {num}
          </button>
        ))}
        {isFca && (
          <button
            type="button"
            data-tour="fca-dont-know"
            onClick={() => onChange({ ...response, rating: DONT_KNOW_RATING })}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-all ${
              response.rating === DONT_KNOW_RATING
                ? "bg-slate-600 text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
            }`}
          >
            I don&apos;t know
          </button>
        )}
      </div>
    );
  };

  if (compact && question.type === "rating") {
    const area = "area" in question ? question.area : undefined;
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
          {renderRatingButtons("sm")}
          <span className="text-[9px] font-medium text-muted-foreground sm:text-right">
            {getRatingLabel(response.rating)}
          </span>
        </div>

        <Textarea
          value={response.explanation}
          onChange={(e) => onChange({ ...response, explanation: e.target.value })}
          placeholder="Please explain your rating. If you want to highlight specific areas in the building, use the annotation tools below!"
          rows={1}
          className="mt-1.5 min-h-7 resize-none px-1.5 py-1 text-[10px] md:text-[10px]"
        />
      </div>
    );
  }

  return (
    <Card className="gap-2 border-border/60 py-2.5 shadow-sm">
      <CardHeader className="px-2.5 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            {question.section}
          </span>
        </div>
        <div className="mt-px flex items-center gap-1">
          <Badge
            style={{ backgroundColor: question.color }}
            className="px-1.5 py-px text-[9px] text-white"
          >
            {question.category}
          </Badge>
          {questionCode && (
            <Badge variant="outline" className="font-mono text-[9px]">
              {questionCode}
            </Badge>
          )}
        </div>
        <CardTitle className="mt-1 font-sans text-xs font-bold leading-snug text-foreground">
          {question.text}
        </CardTitle>
        {tip && (
          <p className="mt-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">Tip: </span>
            {tip}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 px-2.5">
        {question.type === "ranking" ? (
          <div className="space-y-1.5" data-tour="ranking">
            <Label className="text-[11px] font-medium text-foreground">
              Select up to 5 priority categories
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Choose the areas you feel are the highest priorities for
              improvement on this campus.
            </p>
            <CategoryRanking
              categories={PRIORITIZATION_CATEGORIES}
              value={response.ranking}
              onChange={(ranking) => onChange({ ...response, ranking })}
            />
          </div>
        ) : question.type === "text" ? (
          <div className="space-y-1">
            <Label htmlFor="open-response" className="text-[11px] font-medium text-foreground">
              Your response
            </Label>
            <Textarea
              id="open-response"
              value={response.explanation}
              onChange={(e) =>
                onChange({ ...response, explanation: e.target.value })
              }
              placeholder="Type your response..."
              rows={3}
              className="resize-none text-[10px] md:text-[10px]"
            />
          </div>
        ) : (
          <>
            <div className="space-y-2" data-tour="rating">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-foreground">Rating</Label>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {getRatingLabel(response.rating)}
                </span>
              </div>

              <p className="text-[9px] text-muted-foreground">
                1 = Strongly Disagree · 3 = Neutral · 5 = Strongly Agree
              </p>
              <div className="flex justify-center">{renderRatingButtons("md")}</div>
            </div>

            <div className="space-y-1" data-tour="explanation">
              <Label htmlFor="explanation" className="text-[11px] font-medium text-foreground">
                Please explain your rating
              </Label>
              <Textarea
                id="explanation"
                value={response.explanation}
                onChange={(e) =>
                  onChange({ ...response, explanation: e.target.value })
                }
                placeholder="Please explain your rating. If you want to highlight specific areas in the building, use the annotation tools below!"
                rows={2}
                className="resize-none text-[10px] md:text-[10px]"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
