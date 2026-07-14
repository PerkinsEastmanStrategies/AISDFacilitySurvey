export const SURVEY_QUESTIONS = [
  {
    id: 1,
    text: "The studios and instructional spaces effectively support the teaching methods and learning experiences expected for today's students.",
    category: "Learning Environment",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(220, 70%, 50%)",
  },
  {
    id: 2,
    text: "The facility effectively supports the educational programs offered at this school, including specialty programs (e.g., STEM, dual language).",
    category: "Educational Program Alignment",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(160, 60%, 45%)",
  },
  {
    id: 3,
    text: "The school's studios and other learning spaces can be easily adapted to accommodate different teaching approaches, group sizes, and learning activities.",
    category: "Flexibility of Spaces",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(280, 60%, 50%)",
  },
  {
    id: 4,
    text: "The facility effectively supports student collaboration, project-based learning, and small group instruction in spaces outside of studios.",
    category: "Collaboration Opportunities",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(30, 80%, 50%)",
  },
  {
    id: 5,
    text: "The facility provides appropriate spaces for special education (SPED), intervention services, counseling, and other student support functions.",
    category: "Student Support Services",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(340, 70%, 50%)",
  },
  {
    id: 6,
    text: "The layout and organization of the campus and grounds allow staff to effectively supervise students and maintain a safe learning environment.",
    category: "Safety and Supervision",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(200, 70%, 45%)",
  },
  {
    id: 7,
    text: "Spaces such as the library, cafeteria, gymnasium, and multipurpose areas effectively support student and school needs.",
    category: "Common Areas and Shared Spaces",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(45, 80%, 45%)",
  },
  {
    id: 8,
    text: "The facility effectively supports community programming, after-hours activities, or extended-day use.",
    category: "Community / After-Hours Use",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(20, 70%, 50%)",
  },
  {
    id: 9,
    text: "The school's outdoor spaces, such as play, athletics, and outdoor learning areas effectively support programming and student needs.",
    category: "Outdoor Spaces",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(140, 55%, 42%)",
  },
  {
    id: 10,
    text: "The campus appropriately accommodates arrival/drop-off and dismissal/pickup for students and families, including SPED.",
    category: "Arrival and Dismissal",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(300, 50%, 50%)",
  },
  {
    id: 11,
    text: "The facility effectively supports current instructional technology, including connectivity, power access, and digital learning tools.",
    category: "Technology Readiness",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(180, 60%, 45%)",
  },
  {
    id: 12,
    text: "The facility's acoustics effectively support teaching, learning, and daily operations.",
    category: "Acoustics",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(260, 60%, 50%)",
  },
  {
    id: 13,
    text: "The facility provides sufficient workspace and collaboration areas for teachers, administrators, and support staff.",
    category: "Staff Workspace and Collaboration",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(90, 50%, 45%)",
  },
  {
    id: 14,
    text: "The campus provides adequate storage to support the school's instructional and operational needs.",
    category: "Storage",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(15, 65%, 52%)",
  },
  {
    id: 15,
    text: "Overall, the facility effectively supports the school's educational vision, instructional goals, and student success.",
    category: "Overall Educational Suitability",
    section: "Educational Suitability",
    type: "rating",
    color: "hsl(120, 50%, 45%)",
  },
  {
    id: 16,
    text: "What are your top 3 safety and security priorities for this campus?",
    category: "Safety and Security Priorities",
    section: "Educational Suitability",
    type: "text",
    color: "hsl(0, 70%, 45%)",
  },
  {
    id: 17,
    text: "Which categories are your top priorities for improvement on this campus? Select up to 5.",
    category: "Improvement Prioritization",
    section: "Educational Suitability",
    type: "ranking",
    color: "hsl(220, 15%, 40%)",
  },
  {
    id: 18,
    text: "Identify the location of your key program spaces by assigning each one to a room on the floor plan.",
    category: "Program Space Locations",
    section: "Educational Suitability",
    type: "spaces",
    color: "hsl(265, 55%, 50%)",
  },
  // Facility Condition Assessment (FCA) — positive Likert statements
  {
    id: 19,
    questionCode: "A1",
    text: "The overall physical condition of this facility is good and supports our operations.",
    category: "General",
    area: "Overall Facility",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(15, 75%, 50%)",
  },
  {
    id: 20,
    questionCode: "A2",
    text: "Building-related issues rarely disrupt normal school activities.",
    category: "General",
    area: "Recurring Issues",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(15, 75%, 50%)",
  },
  {
    id: 21,
    questionCode: "A3",
    text: "The physical condition of this facility has not noticeably changed over the last 5 years.",
    category: "General",
    area: "Recent Changes",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(15, 75%, 50%)",
  },
  {
    id: 22,
    questionCode: "B1",
    text: "Parking lots and drive areas are in good physical condition.",
    category: "Site & Grounds",
    area: "Parking & Drives",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(95, 50%, 42%)",
  },
  {
    id: 23,
    questionCode: "B2",
    text: "Sidewalks and exterior walking surfaces are in good physical condition.",
    category: "Site & Grounds",
    area: "Sidewalks & Exterior Surfaces",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(95, 50%, 42%)",
  },
  {
    id: 24,
    questionCode: "B3",
    text: "The site provides effective drainage with minimal standing water or muddy areas.",
    category: "Site & Grounds",
    area: "Drainage",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(95, 50%, 42%)",
  },
  {
    id: 25,
    questionCode: "B4",
    text: "The site is free from significant erosion, settlement, or uneven pavement and sidewalks.",
    category: "Site & Grounds",
    area: "Site Settlement / Erosion",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(95, 50%, 42%)",
  },
  {
    id: 26,
    questionCode: "B5",
    text: "Outdoor activity areas are in good physical condition.",
    category: "Site & Grounds",
    area: "Outdoor Areas",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(95, 50%, 42%)",
  },
  {
    id: 27,
    questionCode: "C1",
    text: "The roof effectively prevents leaks and water intrusion.",
    category: "Building Exterior",
    area: "Roofing",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(210, 55%, 48%)",
  },
  {
    id: 28,
    questionCode: "C2",
    text: "Exterior walls and windows are in good physical condition.",
    category: "Building Exterior",
    area: "Exterior Walls & Windows",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(210, 55%, 48%)",
  },
  {
    id: 29,
    questionCode: "C3",
    text: "Exterior doors function reliably and operate as intended.",
    category: "Building Exterior",
    area: "Exterior Doors",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(210, 55%, 48%)",
  },
  {
    id: 30,
    questionCode: "D1",
    text: "Ceilings throughout the building are in good condition.",
    category: "Interior Conditions",
    area: "Ceilings",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(35, 70%, 48%)",
  },
  {
    id: 31,
    questionCode: "D2",
    text: "Flooring throughout the building is in good condition.",
    category: "Interior Conditions",
    area: "Flooring",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(35, 70%, 48%)",
  },
  {
    id: 32,
    questionCode: "D3",
    text: "Interior walls and finishes are in good condition.",
    category: "Interior Conditions",
    area: "Walls & Finishes",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(35, 70%, 48%)",
  },
  {
    id: 33,
    questionCode: "D4",
    text: "Restrooms are in good physical condition and function reliably.",
    category: "Interior Conditions",
    area: "Restrooms",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(35, 70%, 48%)",
  },
  {
    id: 34,
    questionCode: "E1",
    text: "Heating systems provide comfortable temperatures throughout occupied spaces.",
    category: "Heating & Cooling",
    area: "Heating",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(190, 65%, 42%)",
  },
  {
    id: 35,
    questionCode: "E2",
    text: "Cooling systems provide comfortable temperatures throughout occupied spaces.",
    category: "Heating & Cooling",
    area: "Cooling",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(190, 65%, 42%)",
  },
  {
    id: 36,
    questionCode: "E3",
    text: "Ventilation and indoor air quality meet the needs of building occupants.",
    category: "Heating & Cooling",
    area: "Ventilation / Air Quality",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(190, 65%, 42%)",
  },
  {
    id: 37,
    questionCode: "E4",
    text: "Building systems operate without creating disruptive noise or vibration.",
    category: "Heating & Cooling",
    area: "Noise",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(190, 65%, 42%)",
  },
  {
    id: 38,
    questionCode: "F1",
    text: "Plumbing systems operate reliably throughout the facility.",
    category: "Plumbing",
    area: "Plumbing Reliability",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(200, 70%, 45%)",
  },
  {
    id: 39,
    questionCode: "F2",
    text: "Restroom plumbing fixtures function reliably and are well maintained.",
    category: "Plumbing",
    area: "Restroom Fixtures",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(200, 70%, 45%)",
  },
  {
    id: 40,
    questionCode: "F3",
    text: "The building is free from recurring plumbing leaks or water-related issues.",
    category: "Plumbing",
    area: "Water Intrusion",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(200, 70%, 45%)",
  },
  {
    id: 41,
    questionCode: "G1",
    text: "Interior lighting is reliable and provides adequate illumination throughout the building.",
    category: "Electrical & Lighting",
    area: "Interior Lighting",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(45, 80%, 45%)",
  },
  {
    id: 42,
    questionCode: "G2",
    text: "Electrical service is reliable with minimal power disruptions.",
    category: "Electrical & Lighting",
    area: "Power Reliability",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(45, 80%, 45%)",
  },
  {
    id: 43,
    questionCode: "G3",
    text: "Emergency lighting appears functional and ready for use.",
    category: "Electrical & Lighting",
    area: "Emergency Lighting",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(45, 80%, 45%)",
  },
  {
    id: 44,
    questionCode: "H1",
    text: "Fire alarm systems appear reliable and fully functional.",
    category: "Safety & Security",
    area: "Fire Alarm Systems",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(0, 65%, 50%)",
  },
  {
    id: 45,
    questionCode: "H2",
    text: "Building security systems and entry controls operate reliably.",
    category: "Safety & Security",
    area: "Security Systems",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(0, 65%, 50%)",
  },
  {
    id: 46,
    questionCode: "H3",
    text: "The facility provides a safe physical environment for students and staff.",
    category: "Safety & Security",
    area: "Safety Concerns",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(0, 65%, 50%)",
  },
  {
    id: 47,
    questionCode: "H4",
    text: "Building systems perform reliably during emergency events and drills.",
    category: "Safety & Security",
    area: "Emergency Events",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(0, 65%, 50%)",
  },
  {
    id: 48,
    questionCode: "I1",
    text: "Accessibility features are functional and effectively support building users.",
    category: "Accessibility",
    area: "Accessibility Features",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(265, 55%, 50%)",
  },
  {
    id: 49,
    questionCode: "I2",
    text: "Elevators and lifts operate reliably when needed.",
    category: "Accessibility",
    area: "Elevators / Lifts",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(265, 55%, 50%)",
  },
  {
    id: 50,
    questionCode: "J1",
    text: "Gymnasiums and athletic facilities are in good physical condition.",
    category: "Specialty Areas",
    area: "Gymnasium & Athletic Areas",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(280, 60%, 50%)",
  },
  {
    id: 51,
    questionCode: "J2",
    text: "Cafeteria and kitchen areas are in good physical condition.",
    category: "Specialty Areas",
    area: "Cafeteria & Kitchen Areas",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(280, 60%, 50%)",
  },
  {
    id: 52,
    questionCode: "J3",
    text: "Auditorium and stage areas are in good physical condition.",
    category: "Specialty Areas",
    area: "Auditorium / Stage Areas",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(280, 60%, 50%)",
  },
  {
    id: 53,
    questionCode: "J4",
    text: "Specialty classrooms (labs, shops, music rooms, etc.) are in good physical condition.",
    category: "Specialty Areas",
    area: "Specialty Classrooms",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(280, 60%, 50%)",
  },
  // School Leader (principal) simplified facility condition questions —
  // six combined prompts covering every Operations FCA category.
  // Each is its own step (like Educational Suitability), not a category group.
  {
    id: 54,
    questionCode: "P1",
    text: "Parking lots, drives, sidewalks, drainage, and outdoor activity areas (playgrounds, fields, courtyards) are in good physical condition and safe for daily use.",
    category: "Site & Grounds",
    area: "Site & Grounds",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(95, 50%, 42%)",
    tip: "Think about potholes, uneven pavement, standing water, muddy spots, erosion, and the condition of play/athletic areas and arrival zones.",
  },
  {
    id: 55,
    questionCode: "P2",
    text: "The roof, exterior walls, windows, and exterior doors keep the building dry and secure, and are in good physical condition.",
    category: "Building Exterior",
    area: "Roof & Building Exterior",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(210, 55%, 48%)",
    tip: "Include roof leak answers here — active leaks, stained ceiling tiles, bucket placements during rain, and water intrusion near windows or exterior walls. Also note sticky or unreliable exterior doors.",
  },
  {
    id: 56,
    questionCode: "P3",
    text: "Interior ceilings, flooring, walls/finishes, and restrooms throughout the building are in good physical condition.",
    category: "Interior Conditions",
    area: "Interior Conditions",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(35, 70%, 48%)",
    tip: "Consider worn flooring, damaged walls, stained or missing ceiling tiles, and whether restrooms feel well maintained and fully functional.",
  },
  {
    id: 57,
    questionCode: "P4",
    text: "Heating, cooling, ventilation, plumbing, lighting, and electrical service reliably support comfortable and continuous school operations.",
    category: "Building Systems",
    area: "HVAC, Plumbing & Electrical",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(190, 65%, 42%)",
    tip: "Include hot/cold classrooms, air quality concerns, noisy equipment, recurring plumbing leaks or fixture failures, dim/flickering lights, and power outages. Mark locations on the floor plan when you can.",
  },
  {
    id: 58,
    questionCode: "P5",
    text: "Fire/life-safety systems, building security and entry controls, and accessibility features (including elevators/lifts, where present) work reliably and support a safe campus.",
    category: "Safety, Security & Accessibility",
    area: "Safety, Security & Accessibility",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(0, 65%, 50%)",
    tip: "Think about fire alarms, secure entry reliability during the school day, physical safety concerns, emergency drill issues, and accessibility barriers for students or staff.",
  },
  {
    id: 59,
    questionCode: "P6",
    text: "Specialty spaces (gym, cafeteria/kitchen, auditorium/stage, labs, shops, music rooms, etc.) are in good physical condition, and overall the facility rarely disrupts teaching and learning.",
    category: "Specialty Areas & Overall",
    area: "Specialty Areas & Overall Condition",
    section: "Facility Condition",
    type: "rating",
    color: "hsl(280, 60%, 50%)",
    tip: "If issues are limited to certain specialty rooms, note them here (and pin them on the plan). Also reflect whether building problems frequently interrupt classes or school programs.",
  },
] as const;

/** Simplified Facility Condition questions shown only to School Leaders. */
export const SCHOOL_LEADER_FCA_QUESTION_IDS = new Set([54, 55, 56, 57, 58, 59]);

/** Sentinel rating for FCA "I don't know" — counts as answered but excluded from scoring. */
export const DONT_KNOW_RATING = -1;

export const FCA_LIKERT_SCALE_NOTE =
  "Rate each statement from 1 (Strongly Disagree) to 5 (Strongly Agree). Select \"I don't know\" if you are unable to answer — it will not be included in scoring.";

export function isRatingAnswered(rating: number): boolean {
  return rating > 0 || rating === DONT_KNOW_RATING;
}

export function isRatingScored(rating: number): boolean {
  return rating > 0;
}

export function isFacilityConditionQuestion(
  question: Pick<SurveyQuestion, "section">
): boolean {
  return question.section === "Facility Condition";
}

export function formatRatingDisplay(
  rating: number,
  section?: SurveyQuestion["section"]
): string {
  if (rating === DONT_KNOW_RATING) return "I don't know";
  if (rating <= 0) return "-";

  // ESA and FCA both use a Strongly Disagree → Strongly Agree Likert scale.
  switch (rating) {
    case 1:
      return "Strongly Disagree";
    case 2:
      return "Disagree";
    case 3:
      return "Neutral";
    case 4:
      return "Agree";
    case 5:
      return "Strongly Agree";
    default:
      return String(rating);
  }
}

/**
 * The educational-suitability categories that respondents choose from in the
 * Improvement Prioritization question (they pick up to MAX_PRIORITIES). Derived
 * from the rating questions, excluding the summary "Overall Educational Suitability".
 */
export const PRIORITIZATION_CATEGORIES: string[] = SURVEY_QUESTIONS.filter(
  (q) =>
    q.section === "Educational Suitability" &&
    q.type === "rating" &&
    q.category !== "Overall Educational Suitability"
).map((q) => q.category);

/** Maximum number of priorities a respondent may select in Improvement Prioritization. */
export const MAX_PRIORITIES = 5;

export type SurveyQuestion = (typeof SURVEY_QUESTIONS)[number];

/**
 * Returns the questions a given role should answer.
 * - School Leaders: Educational Suitability + six combined Campus Condition prompts.
 * - Operations Staff: the full Facility Condition (FCA) question set only.
 */
export function getQuestionsForRole(role: SurveyData["role"]): SurveyQuestion[] {
  if (role === "operations") {
    return SURVEY_QUESTIONS.filter(
      (q) =>
        q.section === "Facility Condition" &&
        !SCHOOL_LEADER_FCA_QUESTION_IDS.has(q.id)
    );
  }
  if (role === "school_leader") {
    return SURVEY_QUESTIONS.filter(
      (q) =>
        q.section === "Educational Suitability" ||
        SCHOOL_LEADER_FCA_QUESTION_IDS.has(q.id)
    );
  }
  return [];
}

/** Returns true when an annotation should be visible for the active question filter. */
export function annotationMatchesQuestionFilter(
  annotation: Pick<Annotation, "questionId">,
  filterQuestionId?: number | null,
  filterQuestionIds?: number[] | null
): boolean {
  if (filterQuestionIds != null && filterQuestionIds.length > 0) {
    return filterQuestionIds.includes(annotation.questionId);
  }
  if (filterQuestionId != null) {
    return annotation.questionId === filterQuestionId;
  }
  return true;
}

export interface Annotation {
  id: string;
  questionId: number;
  type: "pin" | "circle" | "freeform";
  // For floor plan: SVG coordinates. For map: x = longitude, y = latitude.
  x: number;
  y: number;
  // Floor plan: SVG units. Map: radius in meters.
  radius?: number;
  // Floor plan: SVG coordinates. Map: { x: lng, y: lat }.
  points?: { x: number; y: number }[];
  comment: string;
  classification: "strength" | "weakness";
  color: string;
  // Which surface the annotation belongs to. Defaults to floor plan.
  view?: "floorplan" | "map";
  /** Floor level id when a school has multiple plan SVGs (e.g. floor-1, floor-2, basement). */
  floorKey?: string;
  // For floor plan pins: the room number (SVG data-k) the pin falls within, if any.
  roomKey?: string;
  // Optional human-readable room label (name / type) from the SVG text labels.
  roomLabel?: string;
  /** Rooms whose polygons fall within a circle or freeform shape annotation. */
  roomsInShape?: Array<{ roomKey: string; roomLabel?: string }>;
}

export interface QuestionResponse {
  questionId: number;
  rating: number;
  explanation: string;
  /**
   * For the ranking-type question (Improvement Prioritization), the set of
   * selected priority categories (unordered, up to MAX_PRIORITIES).
   */
  ranking?: string[];
}

export type SurveyRole = "school_leader" | "operations";

export interface SurveyData {
  school: string;
  role: SurveyRole | "";
  principalName: string;
  email: string;
  schoolDescription: string;
  uniqueFeatures: string;
  specialEducation: string;
  responses: QuestionResponse[];
  annotations: Annotation[];
  svgContent: string | null;
  /**
   * Maps a program space name (e.g. "Maker Space") to one or more rooms placed on
   * the floor plan. Each space can have multiple rooms assigned to it.
   */
  spaceAssignments: Record<string, SpaceRoomEntry[]>;
}

/** A single room assigned to a program space by clicking the floor plan. */
export interface SpaceRoomEntry {
  /** Room number / key from the SVG (data-k) */
  roomKey: string;
  /** Human-readable room label (e.g. "Gym"), if available */
  roomLabel?: string;
  /** Centroid in SVG coordinates, used to render the label on the plan */
  x: number;
  y: number;
}
