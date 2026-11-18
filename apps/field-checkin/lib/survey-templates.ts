import type { SurveyQuestion } from "./types";

export const DEFAULT_HOSPITAL_QUESTIONS: SurveyQuestion[] = [
  {
    id: "mother_name",
    label: "MOTHER'S NAME",
    type: "text",
    required: true,
    placeholder: "e.g. Mrs. Ngozi Eze",
  },
  {
    id: "phone_no",
    label: "PHONE NO.",
    type: "tel",
    required: false,
    placeholder: "e.g. 08031234567",
  },
  {
    id: "clinic",
    label: "CLINIC",
    type: "select",
    required: true,
    options: ["ANC", "IMC"],
  },
  {
    id: "hospital_name",
    label: "HOSPITAL NAME",
    type: "text",
    required: true,
    placeholder: "Enter hospital name",
    autoFillStoreName: true,
  },
  {
    id: "marketing_consent",
    label:
      "We would love to stay in touch to gather your feedback and share updates about Cussons Baby Skincare Range, Molfix Baby Diaper and related promotions. Please indicate your preference below:",
    type: "radio_consent",
    required: true,
    options: [
      "Yes, I consent to being contacted by Cussons Baby Range for feedback and promotional updates",
      "No, I do not wish to be contacted.",
    ],
  },
];
