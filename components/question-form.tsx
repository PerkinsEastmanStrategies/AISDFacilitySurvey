"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
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
        ? "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition-all"
        : "flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold transition-all";

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onChange({ ...response, rating: num })}
            className={`${buttonClass} ${
              response.rating === num
                ? `${getRatingColor(num)} text-white scale-110 shadow-md`
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
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all sm:text-sm ${
              response.rating === DONT_KNOW_RATING
                ? "bg-slate-600 text-white shadow-md"
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
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-start gap-2">
          {questionCode && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {questionCode}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {area && (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {area}
              </p>
            )}
            <p className="mt-1 text-sm font-medium leading-relaxed text-foreground">
              {question.text}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-tour="rating">
          {renderRatingButtons("sm")}
          <span className="text-xs font-medium text-muted-foreground sm:text-right">
            {getRatingLabel(response.rating)}
          </span>
        </div>

        <Textarea
          value={response.explanation}
          onChange={(e) => onChange({ ...response, explanation: e.target.value })}
          placeholder="Explain why (optional)..."
          rows={2}
          className="mt-3 resize-none text-sm"
        />
      </div>
    );
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {question.section}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge
            style={{ backgroundColor: question.color }}
            className="text-white px-3 py-1"
          >
            {question.category}
          </Badge>
          {questionCode && (
            <Badge variant="outline" className="font-mono text-xs">
              {questionCode}
            </Badge>
          )}
        </div>
        <CardTitle className="font-sans text-lg font-semibold leading-relaxed text-foreground mt-2">
          {question.text}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {question.type === "ranking" ? (
          <div className="space-y-3" data-tour="ranking">
            <Label className="text-foreground font-medium">
              Select up to 5 priority categories
            </Label>
            <p className="text-sm text-muted-foreground">
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
          <div className="space-y-2.5">
            <Label htmlFor="open-response" className="text-foreground font-medium">
              Your response
            </Label>
            <Textarea
              id="open-response"
              value={response.explanation}
              onChange={(e) =>
                onChange({ ...response, explanation: e.target.value })
              }
              placeholder="Type your response..."
              rows={5}
              className="resize-none"
            />
          </div>
        ) : (
          <>
            <div className="space-y-4" data-tour="rating">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">Rating</Label>
                <span className="text-sm font-medium text-muted-foreground">
                  {getRatingLabel(response.rating)}
                </span>
              </div>

              {isFca ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    1 = Strongly Disagree · 3 = Neutral · 5 = Strongly Agree
                  </p>
                  <div className="flex justify-center">{renderRatingButtons("md")}</div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <Slider
                      value={[Math.max(response.rating, 1)]}
                      onValueChange={([value]) =>
                        onChange({ ...response, rating: value })
                      }
                      min={1}
                      max={5}
                      step={1}
                      className="w-full"
                      disabled={response.rating === DONT_KNOW_RATING}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1 - Very Poor</span>
                      <span>3 - Adequate</span>
                      <span>5 - Excellent</span>
                    </div>
                  </div>
                  <div className="flex justify-center">{renderRatingButtons("md")}</div>
                </>
              )}
            </div>

            <div className="space-y-2.5" data-tour="explanation">
              <Label htmlFor="explanation" className="text-foreground font-medium">
                Please explain your rating
              </Label>
              <Textarea
                id="explanation"
                value={response.explanation}
                onChange={(e) =>
                  onChange({ ...response, explanation: e.target.value })
                }
                placeholder="Provide a brief explanation of why you answered this way..."
                rows={4}
                className="resize-none"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
