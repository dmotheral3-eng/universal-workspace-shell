import type { Entity, Item, Document, Stage, Metric, DataProvider } from "./types";

const entities: Entity[] = [
  { id: "e1", name: "Margaret Chen", subtitle: "DOB: 1958-03-14 | MRN: 4820193", status: "Active", tags: ["Cardiology", "Diabetes"] },
  { id: "e2", name: "Robert Whitfield", subtitle: "DOB: 1945-11-02 | MRN: 3910284", status: "Active", tags: ["Oncology"] },
  { id: "e3", name: "Sarah Okonkwo", subtitle: "DOB: 1972-07-19 | MRN: 5528301", status: "Active", tags: ["Neurology", "Pain Management"] },
  { id: "e4", name: "James Hartwell", subtitle: "DOB: 1980-01-25 | MRN: 6129405", status: "Pending Review", tags: ["Orthopedics"] },
  { id: "e5", name: "Linda Vasquez", subtitle: "DOB: 1963-09-08 | MRN: 4401938", status: "Active", tags: ["Pulmonology", "Allergy"] },
  { id: "e6", name: "David Kim", subtitle: "DOB: 1990-04-12 | MRN: 7723019", status: "Active", tags: ["Dermatology"] },
  { id: "e7", name: "Patricia Morrow", subtitle: "DOB: 1955-12-30 | MRN: 3305821", status: "Discharged", tags: ["Cardiology", "Renal"] },
  { id: "e8", name: "Thomas Okafor", subtitle: "DOB: 1968-06-17 | MRN: 5019284", status: "Active", tags: ["Gastroenterology"] },
  { id: "e9", name: "Emily Richardson", subtitle: "DOB: 1985-02-28 | MRN: 6842910", status: "Active", tags: ["OB/GYN"] },
  { id: "e10", name: "Michael Santos", subtitle: "DOB: 1977-10-05 | MRN: 5930128", status: "Active", tags: ["Psychiatry", "Neurology"] },
  { id: "e11", name: "Catherine Bell", subtitle: "DOB: 1950-08-22 | MRN: 2918304", status: "Pending Review", tags: ["Geriatrics", "Cardiology"] },
  { id: "e12", name: "William Drake", subtitle: "DOB: 1943-05-11 | MRN: 2104938", status: "Active", tags: ["Urology", "Oncology"] },
];

const items: Item[] = [
  { id: "i1", entityId: "e1", title: "Annual Cardiology Review", date: "2024-11-15", status: "Completed", type: "Office Visit", summary: "Routine cardiac assessment. EF stable at 55%. Continue current medications." },
  { id: "i2", entityId: "e1", title: "HbA1c Follow-up", date: "2024-10-22", status: "Completed", type: "Lab Review", summary: "HbA1c improved to 6.8% from 7.2%. Medication adjustment effective." },
  { id: "i3", entityId: "e1", title: "Echocardiogram", date: "2024-09-30", status: "Completed", type: "Imaging", summary: "Normal LV function. Mild mitral regurgitation unchanged." },
  { id: "i4", entityId: "e1", title: "Medication Reconciliation", date: "2024-09-15", status: "Completed", type: "Pharmacy", summary: "Reviewed 8 active medications. No interactions identified." },
  { id: "i5", entityId: "e1", title: "Diabetic Foot Exam", date: "2024-08-20", status: "Completed", type: "Office Visit", summary: "No neuropathy detected. Pedal pulses intact bilaterally." },
  { id: "i6", entityId: "e2", title: "Chemotherapy Cycle 4", date: "2024-11-20", status: "In Progress", type: "Treatment", summary: "Carboplatin/Paclitaxel. Tolerating well with Grade 1 nausea." },
  { id: "i7", entityId: "e2", title: "CT Chest/Abdomen/Pelvis", date: "2024-11-01", status: "Completed", type: "Imaging", summary: "Partial response. Primary mass reduced 30%. No new lesions." },
  { id: "i8", entityId: "e2", title: "Oncology Consult", date: "2024-10-05", status: "Completed", type: "Office Visit", summary: "Discussed treatment options. Patient elected to continue current regimen." },
  { id: "i9", entityId: "e2", title: "Port Placement", date: "2024-09-12", status: "Completed", type: "Procedure", summary: "Right subclavian port placed without complication." },
  { id: "i10", entityId: "e2", title: "Pulmonary Function Test", date: "2024-09-01", status: "Completed", type: "Diagnostic", summary: "FEV1 78% predicted. Adequate for continuation of therapy." },
  { id: "i11", entityId: "e3", title: "Neurology Follow-up", date: "2024-11-18", status: "Completed", type: "Office Visit", summary: "Migraine frequency reduced with new prophylaxis. VAS pain score 3/10." },
  { id: "i12", entityId: "e3", title: "MRI Brain", date: "2024-10-28", status: "Completed", type: "Imaging", summary: "No structural abnormality. No evidence of demyelination." },
  { id: "i13", entityId: "e3", title: "Pain Management Review", date: "2024-10-10", status: "Completed", type: "Office Visit", summary: "Tapering gabapentin. Starting topiramate 25mg." },
  { id: "i14", entityId: "e3", title: "EEG", date: "2024-09-20", status: "Completed", type: "Diagnostic", summary: "Normal awake and drowsy EEG. No epileptiform discharges." },
  { id: "i15", entityId: "e4", title: "Knee Arthroscopy Pre-op", date: "2024-11-22", status: "Scheduled", type: "Office Visit", summary: "Pre-operative assessment for right knee arthroscopy." },
  { id: "i16", entityId: "e4", title: "MRI Right Knee", date: "2024-11-05", status: "Completed", type: "Imaging", summary: "Medial meniscus tear, posterior horn. Grade II chondromalacia patella." },
  { id: "i17", entityId: "e4", title: "Physical Therapy Evaluation", date: "2024-10-15", status: "Completed", type: "Consultation", summary: "ROM limited. Quad weakness noted. PT 2x/week recommended." },
  { id: "i18", entityId: "e5", title: "Pulmonary Function Test", date: "2024-11-10", status: "Completed", type: "Diagnostic", summary: "FEV1/FVC ratio 0.68. Moderate obstruction. Bronchodilator responsive." },
  { id: "i19", entityId: "e5", title: "Allergy Panel Review", date: "2024-10-20", status: "Completed", type: "Lab Review", summary: "Positive for dust mites, cat dander, and ragweed." },
  { id: "i20", entityId: "e6", title: "Biopsy Results Review", date: "2024-11-12", status: "Completed", type: "Office Visit", summary: "Benign compound nevus. No dysplasia. Routine follow-up in 6 months." },
  { id: "i21", entityId: "e6", title: "Full Body Skin Exam", date: "2024-10-01", status: "Completed", type: "Office Visit", summary: "3 lesions biopsied. No clinical concern for melanoma." },
  { id: "i22", entityId: "e7", title: "Discharge Summary", date: "2024-08-30", status: "Completed", type: "Documentation", summary: "Discharged after successful CABG. Follow-up with cardiology in 4 weeks." },
  { id: "i23", entityId: "e8", title: "Colonoscopy", date: "2024-11-05", status: "Completed", type: "Procedure", summary: "Two polyps removed. Pathology pending. Next screening in 3 years." },
  { id: "i24", entityId: "e8", title: "GI Consultation", date: "2024-10-12", status: "Completed", type: "Office Visit", summary: "Chronic GERD, inadequate response to PPI. Colonoscopy scheduled." },
  { id: "i25", entityId: "e9", title: "Prenatal Visit - 28 weeks", date: "2024-11-19", status: "Completed", type: "Office Visit", summary: "Normal growth. GDM screening negative. Rh immunoglobulin administered." },
  { id: "i26", entityId: "e9", title: "Anatomy Scan", date: "2024-10-08", status: "Completed", type: "Imaging", summary: "Normal fetal anatomy. EFW 50th percentile. Anterior placenta." },
  { id: "i27", entityId: "e10", title: "Psychiatric Evaluation", date: "2024-11-14", status: "Completed", type: "Office Visit", summary: "GAD-7: 12. PHQ-9: 8. Adjusting sertraline to 100mg." },
  { id: "i28", entityId: "e10", title: "Neuropsych Testing", date: "2024-10-25", status: "Completed", type: "Diagnostic", summary: "Cognitive function within normal limits. No evidence of early dementia." },
  { id: "i29", entityId: "e11", title: "Geriatric Assessment", date: "2024-11-08", status: "Completed", type: "Office Visit", summary: "MMSE 26/30. Mild cognitive impairment. Falls risk moderate." },
  { id: "i30", entityId: "e12", title: "PSA Follow-up", date: "2024-11-21", status: "Completed", type: "Lab Review", summary: "PSA 4.2, stable from 4.0. Active surveillance continues." },
];

const documents: Document[] = [
  {
    id: "d1",
    title: "Care Plan Summary",
    type: "structured",
    category: "Clinical",
    createdAt: "2024-11-01",
    sections: [
      { id: "s1", title: "Overview", content: "This document outlines the comprehensive care plan for the current treatment period. All recommendations have been reviewed by the attending physician and discussed with the patient." },
      { id: "s2", title: "Active Problems", content: "1. Type 2 Diabetes Mellitus — controlled on metformin 1000mg BID\n2. Hypertension — managed with lisinopril 20mg daily\n3. Hyperlipidemia — atorvastatin 40mg daily\n4. Coronary Artery Disease — stable, s/p PCI 2019" },
      { id: "s3", title: "Medications", content: "Metformin 1000mg BID\nLisinopril 20mg daily\nAtorvastatin 40mg daily\nAspirin 81mg daily\nMetoprolol succinate 50mg daily\nOmeprazole 20mg daily\nVitamin D3 2000 IU daily\nFish oil 1000mg daily" },
      { id: "s4", title: "Goals", content: "- HbA1c below 7.0%\n- Blood pressure below 130/80\n- LDL below 70 mg/dL\n- Weight reduction of 5% over 6 months\n- Exercise 150 minutes per week" },
      { id: "s5", title: "Follow-up", content: "Return to clinic in 3 months. Labs (CMP, Lipid Panel, HbA1c) 1 week prior to visit. Annual eye exam and foot exam due March 2025." },
    ],
  },
  {
    id: "d2",
    title: "Informed Consent — Procedure",
    type: "structured",
    category: "Legal",
    createdAt: "2024-10-15",
    sections: [
      { id: "s6", title: "Procedure Description", content: "Right knee arthroscopy with possible partial meniscectomy. The procedure involves small incisions around the knee joint through which a camera and instruments are inserted to evaluate and treat the torn meniscus." },
      { id: "s7", title: "Risks", content: "Risks include but are not limited to: infection (less than 1%), blood clots (DVT/PE), nerve or vessel injury, stiffness, continued pain, need for further surgery, anesthetic complications, and allergic reaction to materials used." },
      { id: "s8", title: "Benefits", content: "Expected benefits include reduced knee pain, improved range of motion, return to normal activities within 4–6 weeks, and prevention of further cartilage damage." },
      { id: "s9", title: "Alternatives", content: "Non-surgical alternatives include continued physical therapy, activity modification, anti-inflammatory medications, and corticosteroid injections. These have been discussed and patient prefers surgical intervention." },
    ],
  },
  {
    id: "d3",
    title: "Lab Results — November 2024",
    type: "structured",
    category: "Results",
    createdAt: "2024-11-10",
    sections: [
      { id: "s10", title: "Complete Blood Count", content: "WBC: 6.8 (4.5–11.0)\nRBC: 4.52 (4.0–5.5)\nHemoglobin: 13.8 (12.0–16.0)\nHematocrit: 41.2 (36–46)\nPlatelets: 245 (150–400)\nMCV: 91 (80–100)\nMCH: 30.5 (27–33)" },
      { id: "s11", title: "Comprehensive Metabolic Panel", content: "Glucose: 112 H (70–100)\nBUN: 18 (7–20)\nCreatinine: 0.9 (0.6–1.2)\nSodium: 139 (136–145)\nPotassium: 4.1 (3.5–5.0)\nChloride: 101 (98–106)\nCO2: 24 (21–28)\nCalcium: 9.4 (8.5–10.5)\nTotal Protein: 7.1 (6.0–8.3)\nAlbumin: 4.2 (3.5–5.5)\nAST: 24 (10–40)\nALT: 28 (7–56)\nAlk Phos: 72 (44–147)" },
      { id: "s12", title: "Lipid Panel", content: "Total Cholesterol: 178 (<200)\nLDL: 68 (<70) — AT GOAL\nHDL: 52 (>40)\nTriglycerides: 145 (<150)\nNon-HDL Cholesterol: 126" },
      { id: "s13", title: "HbA1c", content: "HbA1c: 6.8% (prior: 7.2%)\nEstimated Average Glucose: 148 mg/dL\nInterpretation: Improved glycemic control. At target." },
    ],
  },
  {
    id: "d4",
    title: "Imaging Report — CT Chest",
    type: "markdown",
    category: "Results",
    createdAt: "2024-11-01",
    sections: [
      { id: "s14", title: "Full Report", content: "## CT Chest/Abdomen/Pelvis with Contrast\n\n**Indication:** Restaging non-small cell lung cancer after 3 cycles of chemotherapy.\n\n**Comparison:** CT dated 2024-08-15.\n\n**Technique:** Helical CT from thoracic inlet through pelvis with 100mL Omnipaque 350 IV contrast.\n\n### Findings\n\n**Chest:**\n- Right upper lobe mass measures 2.8 x 2.1 cm (previously 4.0 x 3.2 cm) — 30% reduction by RECIST\n- No new pulmonary nodules\n- Mediastinal lymph nodes: station 4R node 0.8 cm (previously 1.4 cm)\n- No pleural effusion\n- Heart size normal\n\n**Abdomen:**\n- Liver, spleen, pancreas, adrenals: unremarkable\n- No retroperitoneal lymphadenopathy\n- Kidneys: bilateral simple cysts, stable\n\n**Pelvis:**\n- No pelvic lymphadenopathy\n- Bladder and bowel: unremarkable\n\n### Impression\n1. Partial response to therapy — 30% reduction in primary RUL mass\n2. Improvement in mediastinal lymphadenopathy\n3. No evidence of distant metastasis" },
    ],
  },
  {
    id: "d5",
    title: "Patient Education — Diabetes Management",
    type: "markdown",
    category: "Education",
    createdAt: "2024-09-20",
    sections: [
      { id: "s15", title: "Content", content: "## Understanding Your Diabetes\n\nType 2 diabetes means your body does not use insulin effectively. Over time, this causes blood sugar to remain elevated, which can damage blood vessels and nerves.\n\n## Daily Management\n\n### Blood Sugar Monitoring\nCheck your blood sugar as directed. Target ranges:\n- Before meals: 80–130 mg/dL\n- 2 hours after meals: below 180 mg/dL\n\n### Medications\nTake all medications as prescribed, even when feeling well. Metformin should be taken with food to reduce stomach upset.\n\n### Diet\n- Focus on vegetables, lean proteins, and whole grains\n- Limit refined carbohydrates and sugary drinks\n- Eat consistent portions at regular times\n- Aim for 25–30g of fiber daily\n\n### Exercise\n- 150 minutes of moderate activity per week\n- Include both aerobic exercise and strength training\n- Check blood sugar before and after exercise\n\n## When to Seek Help\nContact your care team if:\n- Blood sugar consistently above 250 mg/dL\n- Blood sugar below 70 mg/dL with symptoms\n- Illness lasting more than 2 days\n- New numbness or tingling in feet" },
    ],
  },
  {
    id: "d6",
    title: "Referral Letter — Cardiology",
    type: "structured",
    category: "Correspondence",
    createdAt: "2024-10-28",
    sections: [
      { id: "s16", title: "Recipient", content: "Dr. Andrew Patel, MD, FACC\nCardiovascular Associates\n1200 Medical Center Drive, Suite 400" },
      { id: "s17", title: "Reason for Referral", content: "Requesting evaluation of new-onset atrial fibrillation detected on routine ECG. Patient is asymptomatic. CHA2DS2-VASc score of 3. Please advise on anticoagulation and rate/rhythm control strategy." },
      { id: "s18", title: "Relevant History", content: "68-year-old female with HTN, DM2, and prior TIA (2021). Current medications include metoprolol 50mg daily. Resting HR 88 bpm, irregularly irregular. No prior cardiac imaging since 2022 echocardiogram (normal EF, no valvular disease)." },
      { id: "s19", title: "Requested Actions", content: "1. Evaluate for anticoagulation (apixaban vs. warfarin)\n2. Consider repeat echocardiogram\n3. Holter monitor for rate assessment\n4. Advise on rhythm control vs. rate control strategy" },
    ],
  },
];

const stages: Record<string, Stage[]> = {
  e1: [
    { id: "st1", name: "Initial Assessment", state: "done", detail: "Completed 2024-01-15" },
    { id: "st2", name: "Diagnostic Workup", state: "done", detail: "Labs and imaging complete" },
    { id: "st3", name: "Treatment Plan", state: "done", detail: "Medication regimen established" },
    { id: "st4", name: "Active Treatment", state: "current", detail: "Quarterly monitoring" },
    { id: "st5", name: "Goal Achievement", state: "pending" },
    { id: "st6", name: "Maintenance Phase", state: "pending" },
  ],
  e2: [
    { id: "st7", name: "Diagnosis", state: "done", detail: "Stage IIIA NSCLC confirmed" },
    { id: "st8", name: "Treatment Planning", state: "done", detail: "MDT discussion completed" },
    { id: "st9", name: "Chemotherapy", state: "current", detail: "Cycle 4 of 6" },
    { id: "st10", name: "Restaging", state: "pending" },
    { id: "st11", name: "Consolidation", state: "pending" },
    { id: "st12", name: "Surveillance", state: "pending" },
  ],
  e4: [
    { id: "st13", name: "Referral", state: "done" },
    { id: "st14", name: "Consultation", state: "done" },
    { id: "st15", name: "Imaging", state: "done" },
    { id: "st16", name: "Pre-op Clearance", state: "current", detail: "Awaiting cardiology clearance" },
    { id: "st17", name: "Surgery", state: "pending" },
    { id: "st18", name: "Rehabilitation", state: "pending" },
  ],
};

const metrics: Record<string, Metric[]> = {
  e1: [
    { id: "m1", label: "HbA1c", value: "6.8%", delta: "-0.4%", deltaDirection: "down" },
    { id: "m2", label: "Blood Pressure", value: "128/78", delta: "-4/2", deltaDirection: "down" },
    { id: "m3", label: "LDL", value: "68", delta: "-12", deltaDirection: "down" },
    { id: "m4", label: "BMI", value: "27.4", delta: "-0.6", deltaDirection: "down" },
    { id: "m5", label: "Active Meds", value: "8", deltaDirection: "neutral" },
    { id: "m6", label: "Next Visit", value: "14 days", deltaDirection: "neutral" },
  ],
  e2: [
    { id: "m7", label: "Tumor Size", value: "2.8 cm", delta: "-30%", deltaDirection: "down" },
    { id: "m8", label: "Chemo Cycle", value: "4 / 6", deltaDirection: "neutral" },
    { id: "m9", label: "WBC", value: "6.8", delta: "+0.4", deltaDirection: "up" },
    { id: "m10", label: "Performance", value: "ECOG 1", deltaDirection: "neutral" },
    { id: "m11", label: "Weight", value: "72.3 kg", delta: "-1.2", deltaDirection: "down" },
    { id: "m12", label: "Days to Next", value: "7", deltaDirection: "neutral" },
  ],
};

function defaultStages(): Stage[] {
  return [
    { id: "st-def1", name: "Intake", state: "done" },
    { id: "st-def2", name: "Assessment", state: "done" },
    { id: "st-def3", name: "Planning", state: "current" },
    { id: "st-def4", name: "Treatment", state: "pending" },
    { id: "st-def5", name: "Review", state: "pending" },
  ];
}

function defaultMetrics(): Metric[] {
  return [
    { id: "m-def1", label: "Visits (YTD)", value: "4", deltaDirection: "neutral" },
    { id: "m-def2", label: "Last Seen", value: "14 days", deltaDirection: "neutral" },
    { id: "m-def3", label: "Open Items", value: "2", deltaDirection: "neutral" },
    { id: "m-def4", label: "Documents", value: "6", deltaDirection: "neutral" },
  ];
}

export class MockProvider implements DataProvider {
  async listEntities(): Promise<Entity[]> {
    return entities;
  }

  async listItems(entityId: string): Promise<Item[]> {
    return items.filter((item) => item.entityId === entityId);
  }

  async getDocument(docId: string): Promise<Document | null> {
    return documents.find((d) => d.id === docId) ?? null;
  }

  async listDocuments(): Promise<Document[]> {
    return documents;
  }

  async getStages(entityId: string): Promise<Stage[]> {
    return stages[entityId] ?? defaultStages();
  }

  async getMetrics(entityId: string): Promise<Metric[]> {
    return metrics[entityId] ?? defaultMetrics();
  }
}
