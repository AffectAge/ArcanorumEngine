import { useEffect, useState } from "react";
import {
  BarChart3,
  Beaker,
  BookOpen,
  Check,
  ChevronsRight,
  Coins,
  Crown,
  Droplets,
  EyeOff,
  Flag,
  Gavel,
  Hammer,
  Info,
  Landmark,
  Leaf,
  LineChart,
  Pickaxe,
  PieChart,
  Plus,
  Scale,
  ScrollText,
  Shield,
  Swords,
  Users,
} from "lucide-react";
import { useUiText } from "../../i18n/useUiText";
import { AppButton } from "./AppButton";
import { AppToggle } from "./AppForm";
import { AppStatusChip } from "./AppSurface";
import { GameActionBar } from "./GameActionBar";
import { GameChartPreview, type GameChartPreviewType } from "./GameChartPreview";
import { GameChoiceModal, type GameChoiceItem } from "./GameChoiceModal";
import { GameColorPickerButton } from "./GameColorPickerButton";
import { GameDetailPanel } from "./GameDetailPanel";
import { GameDropdownField } from "./GameDropdownField";
import { GameFramePanel } from "./GameFramePanel";
import { GameImageUploadCard } from "./GameImageUploadCard";
import { GameNotificationList } from "./GameNotificationList";
import { GamePlotTooltipCard, type GamePlotTooltipData } from "./GamePlotTooltipCard";
import { GamePreviewChip, GamePreviewChipGroup } from "./GamePreviewChip";
import { GameResourcePanel } from "./GameResourcePanel";
import { GameScrollList } from "./GameScrollList";
import { GameSwitch } from "./GameSwitch";
import { GameTabs } from "./GameTabs";
import { GameTechTreePreview } from "./GameTechTreePreview";
import { GameTextField } from "./GameTextField";
import { GameTooltip } from "./GameTooltip";
import { GameTooltipCard } from "./GameTooltipCard";

const chartPreviews = [
  { id: "line", titleKey: "templates.chart.line", type: "line" },
  { id: "bar", titleKey: "templates.chart.bar", type: "bar" },
  { id: "area", titleKey: "templates.chart.area", type: "area" },
  { id: "donut", titleKey: "templates.chart.donut", type: "donut" },
] satisfies Array<{ id: string; titleKey: string; type: GameChartPreviewType }>;

const COLOR_INPUT_FALLBACK = "black";

export function GameTemplateGallery() {
  const { t } = useUiText();
  const [selectedChoice, setSelectedChoice] = useState("knowledge");
  const [selectedColor, setSelectedColor] = useState(COLOR_INPUT_FALLBACK);
  const [dropdownValue, setDropdownValue] = useState("river");
  const [uploadedFlag, setUploadedFlag] = useState<File | null>(null);
  const [tab, setTab] = useState("info");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--arc-color-gold").trim();
    if (isColorInputValue(themeColor)) setSelectedColor(themeColor);
  }, []);

  const choices: GameChoiceItem[] = [
    {
      id: "knowledge",
      title: t("templates.choice.knowledge"),
      description: t("templates.choice.knowledgeDescription"),
      accentColor: "var(--arc-color-gold)",
      icon: <BookOpen size={42} aria-hidden="true" />,
      effects: [
        { id: "research-speed", label: t("templates.effect.researchSpeed"), value: "+15%", icon: <Beaker size={13} aria-hidden="true" />, valueColor: "var(--arc-color-gold)" },
        { id: "scholar-slot", label: t("templates.effect.scholarSlot"), value: "+1", icon: <BookOpen size={13} aria-hidden="true" />, valueColor: "var(--arc-color-gold)" },
      ],
    },
    {
      id: "discipline",
      title: t("templates.choice.discipline"),
      description: t("templates.choice.disciplineDescription"),
      accentColor: "var(--arc-color-danger-top)",
      icon: <Swords size={42} aria-hidden="true" />,
      effects: [
        { id: "army-strength", label: t("templates.effect.armyStrength"), value: "+10%", icon: <Swords size={13} aria-hidden="true" />, valueColor: "var(--arc-color-danger-text)" },
        { id: "unrest", label: t("templates.effect.unrest"), value: "-5%", icon: <Shield size={13} aria-hidden="true" />, valueColor: "var(--arc-color-success-text)" },
      ],
    },
    {
      id: "trade",
      title: t("templates.choice.trade"),
      description: t("templates.choice.tradeDescription"),
      accentColor: "var(--arc-color-primary-top)",
      icon: <Scale size={42} aria-hidden="true" />,
      effects: [
        { id: "trade-income", label: t("templates.effect.tradeIncome"), value: "+15%", icon: <Coins size={13} aria-hidden="true" />, valueColor: "var(--arc-color-primary-top)" },
        { id: "caravan", label: t("templates.effect.caravan"), value: "+1", icon: <Scale size={13} aria-hidden="true" />, valueColor: "var(--arc-color-primary-top)" },
      ],
    },
    {
      id: "harmony",
      title: t("templates.choice.harmony"),
      description: t("templates.choice.harmonyDescription"),
      accentColor: "var(--arc-color-success-top)",
      icon: <Leaf size={42} aria-hidden="true" />,
      effects: [
        { id: "population-growth", label: t("templates.effect.populationGrowth"), value: "+10%", icon: <Users size={13} aria-hidden="true" />, valueColor: "var(--arc-color-success-text)" },
        { id: "legitimacy", label: t("templates.effect.legitimacy"), value: "+5", icon: <Crown size={13} aria-hidden="true" />, valueColor: "var(--arc-color-success-text)" },
      ],
    },
    {
      id: "stewardship",
      title: t("templates.choice.stewardship"),
      description: t("templates.choice.stewardshipDescription"),
      accentColor: "var(--arc-color-warning-top)",
      icon: <Landmark size={42} aria-hidden="true" />,
      effects: [
        { id: "construction-speed", label: t("templates.effect.constructionSpeed"), value: "+12%", icon: <Gavel size={13} aria-hidden="true" />, labelColor: "var(--arc-color-warning-top)", valueColor: "var(--arc-color-warning-top)" },
        { id: "maintenance", label: t("templates.effect.maintenance"), value: "-8%", icon: <Coins size={13} aria-hidden="true" />, labelColor: "var(--arc-color-success-text)", valueColor: "var(--arc-color-success-text)" },
      ],
    },
    {
      id: "omens",
      title: t("templates.choice.omens"),
      description: t("templates.choice.omensDescription"),
      accentColor: "var(--arc-color-text-soft)",
      icon: <ScrollText size={42} aria-hidden="true" />,
      effects: [
        { id: "ritual-power", label: t("templates.effect.ritualPower"), value: "+20", icon: <Crown size={13} aria-hidden="true" />, labelColor: "var(--arc-color-text-soft)", valueColor: "var(--arc-color-gold)" },
        { id: "omen-risk", label: t("templates.effect.omenRisk"), value: "+4%", icon: <Shield size={13} aria-hidden="true" />, labelColor: "var(--arc-color-danger-text)", valueColor: "var(--arc-color-danger-text)" },
      ],
    },
    {
      id: "envoys",
      title: t("templates.choice.envoys"),
      description: t("templates.choice.envoysDescription"),
      accentColor: "var(--arc-color-primary-top)",
      icon: <Flag size={42} aria-hidden="true" />,
      effects: [
        { id: "envoy-count", label: t("templates.effect.envoyCount"), value: "+2", icon: <Flag size={13} aria-hidden="true" />, labelColor: "var(--arc-color-primary-top)", valueColor: "var(--arc-color-primary-top)" },
        { id: "treaty-cost", label: t("templates.effect.treatyCost"), value: "-10%", icon: <Scale size={13} aria-hidden="true" />, labelColor: "var(--arc-color-gold)", valueColor: "var(--arc-color-success-text)" },
      ],
    },
    {
      id: "resolve",
      title: t("templates.choice.resolve"),
      description: t("templates.choice.resolveDescription"),
      accentColor: "var(--arc-color-danger-top)",
      icon: <Shield size={42} aria-hidden="true" />,
      effects: [
        { id: "fortification", label: t("templates.effect.fortification"), value: "+18%", icon: <Shield size={13} aria-hidden="true" />, labelColor: "var(--arc-color-danger-text)", valueColor: "var(--arc-color-danger-text)" },
        { id: "war-weariness", label: t("templates.effect.warWeariness"), value: "-6%", icon: <Swords size={13} aria-hidden="true" />, labelColor: "var(--arc-kit-text-muted)", valueColor: "var(--arc-color-success-text)" },
      ],
    },
  ];

  const plotTooltipSamples: GamePlotTooltipData[] = [
    {
      title: t("templates.plotTooltip.title"),
      subtitle: t("templates.plotTooltip.subtitle"),
      geography: {
        title: t("hexMap.tagGroupBiome"),
        icon: <Landmark size={13} aria-hidden="true" />,
        rows: [
          { id: "surface", label: t("hexMap.surfaceType"), value: t("hexMap.surface.continent"), icon: <Landmark size={13} aria-hidden="true" /> },
          { id: "biome", label: t("hexMap.tagGroupBiome"), value: t("mapTag.biome.grassland"), icon: <Leaf size={13} aria-hidden="true" /> },
          { id: "relief", label: t("hexMap.tagGroupRelief"), value: t("mapTag.morphology.rough"), icon: <Shield size={13} aria-hidden="true" /> },
          { id: "water", label: t("hexMap.tagGroupWater"), value: t("mapTag.rainfall.wet"), icon: <Droplets size={13} aria-hidden="true" />, tone: "info" },
          { id: "position", label: t("hexMap.position"), value: t("hexMap.position.coastal"), icon: <Flag size={13} aria-hidden="true" />, tone: "muted" },
        ],
      },
      ownership: {
        title: t("hexMap.owner"),
        icon: <Flag size={13} aria-hidden="true" />,
        rows: [
          { id: "owner", label: t("hexMap.owner"), value: t("templates.plotTooltip.owner"), icon: <Flag size={13} aria-hidden="true" />, tone: "info" },
          { id: "settlement", label: t("templates.plotTooltip.section.rural"), value: t("templates.plotTooltip.settlement"), icon: <Landmark size={13} aria-hidden="true" /> },
        ],
      },
      yields: [
        { id: "food", label: t("templates.plotTooltip.food"), value: "11", icon: <Leaf size={16} aria-hidden="true" />, color: "var(--arc-modal-tooltip-positive)" },
        { id: "production", label: t("templates.plotTooltip.production"), value: "4", icon: <Hammer size={16} aria-hidden="true" />, color: "var(--arc-color-gold)" },
        { id: "water", label: t("templates.plotTooltip.water"), value: "2", icon: <Droplets size={16} aria-hidden="true" />, color: "var(--arc-modal-tooltip-info)" },
        { id: "gold", label: t("templates.resource.gold"), value: "3", icon: <Coins size={16} aria-hidden="true" />, color: "var(--arc-kit-gold-strong)" },
      ],
      resource: {
        icon: <Pickaxe size={22} aria-hidden="true" />,
        name: t("templates.plotTooltip.resource"),
        description: t("templates.plotTooltip.resourceDescription"),
        color: "var(--arc-color-gold)",
      },
      movement: {
        title: t("templates.plotTooltip.movement"),
        cost: "4",
        baseCost: t("templates.plotTooltip.baseMovement", { value: 2 }),
        stopOnEnter: true,
        stopLabel: t("templates.plotTooltip.stopOnEnter"),
        rows: [
          { label: t("templates.plotTooltip.movementRough"), value: "+1", icon: <Shield size={13} aria-hidden="true" />, tone: "warning" },
          { label: t("templates.plotTooltip.movementForest"), value: "+1", icon: <Leaf size={13} aria-hidden="true" />, tone: "positive" },
        ],
      },
      sections: [
        {
          title: t("templates.plotTooltip.section.rural"),
          rows: [
            { label: t("templates.plotTooltip.improvement"), value: t("templates.plotTooltip.bonus"), icon: <Hammer size={13} aria-hidden="true" />, tone: "positive" },
          ],
        },
        {
          title: t("templates.plotTooltip.section.units"),
          rows: [
            { label: t("templates.plotTooltip.unit"), value: "1", icon: <Swords size={13} aria-hidden="true" />, tone: "info" },
          ],
        },
      ],
    },
    {
      title: t("templates.plotTooltip.cityTitle"),
      subtitle: t("hexMap.feature.city"),
      geography: {
        title: t("hexMap.tagGroupBiome"),
        icon: <Landmark size={13} aria-hidden="true" />,
        rows: [
          { id: "surface", label: t("hexMap.surfaceType"), value: t("hexMap.surface.island"), icon: <Landmark size={13} aria-hidden="true" /> },
          { id: "position", label: t("hexMap.position"), value: t("hexMap.position.coastal"), icon: <Flag size={13} aria-hidden="true" />, tone: "muted" },
        ],
      },
      ownership: {
        title: t("hexMap.owner"),
        icon: <Flag size={13} aria-hidden="true" />,
        rows: [
          { id: "owner", label: t("hexMap.owner"), value: t("templates.sample.country"), icon: <Flag size={13} aria-hidden="true" />, tone: "info" },
        ],
      },
      yields: [
        { id: "gold", label: t("templates.resource.gold"), value: "9", icon: <Coins size={16} aria-hidden="true" />, color: "var(--arc-kit-gold-strong)" },
        { id: "science", label: t("templates.resource.science"), value: "3", icon: <Beaker size={16} aria-hidden="true" />, color: "var(--arc-modal-tooltip-info)" },
        { id: "culture", label: t("templates.resource.culture"), value: "5", icon: <BookOpen size={16} aria-hidden="true" />, color: "var(--arc-modal-tooltip-warning)" },
      ],
      movement: {
        title: t("templates.plotTooltip.movement"),
        cost: "1",
        baseCost: t("templates.plotTooltip.baseMovement", { value: 1 }),
      },
      sections: [
        {
          title: t("templates.plotTooltip.section.systems"),
          rows: [
            { label: t("hexMap.owner"), value: t("templates.sample.country"), icon: <Flag size={13} aria-hidden="true" />, tone: "info" },
            { label: t("hexMap.unitStack"), value: "1/1", icon: <Shield size={13} aria-hidden="true" />, tone: "muted" },
          ],
        },
      ],
    },
    {
      title: t("templates.plotTooltip.unknownTitle"),
      emptyState: {
        icon: <EyeOff size={22} aria-hidden="true" />,
        title: t("templates.plotTooltip.unknownTitle"),
        description: t("templates.plotTooltip.unknownDescription"),
      },
    },
  ];

  return (
    <div className="arc-kit-gallery">
      <GameActionBar
        title={t("templates.galleryTitle")}
        leading={<Crown size={22} aria-hidden="true" />}
        actions={
          <>
            <AppButton type="button" variant="ghost" size="sm" icon={<ScrollText size={14} aria-hidden="true" />}>
              {t("templates.action.codex")}
            </AppButton>
            <AppButton type="button" variant="primary" size="sm" icon={<Check size={14} aria-hidden="true" />} sound="action.confirm">
              {t("common.confirm")}
            </AppButton>
          </>
        }
      />

      <main className="arc-kit-gallery__layout">
        <section className="grid min-w-0 gap-4">
          <GameChoiceModal
            title={t("templates.choiceModalTitle")}
            description={t("templates.choiceModalDescription")}
            choices={choices}
            selectedId={selectedChoice}
            confirmLabel={t("common.confirm")}
            cancelLabel={t("common.cancel")}
            selectedLabel={t("templates.selected")}
            closeLabel={t("common.close")}
            onSelect={setSelectedChoice}
            onConfirm={() => setSelectedChoice(selectedChoice)}
            onCancel={() => setSelectedChoice("knowledge")}
          />

          <GameTabs
            ariaLabel={t("templates.tabsAria")}
            activeId={tab}
            onChange={setTab}
            tabs={[
              { id: "info", label: t("templates.tab.info"), icon: <Info size={15} aria-hidden="true" /> },
              { id: "culture", label: t("templates.tab.culture"), icon: <Shield size={15} aria-hidden="true" /> },
              { id: "religion", label: t("templates.tab.religion"), icon: <Plus size={15} aria-hidden="true" /> },
              { id: "race", label: t("templates.tab.race"), icon: <Users size={15} aria-hidden="true" /> },
              { id: "result", label: t("templates.tab.result"), icon: <Flag size={15} aria-hidden="true" /> },
            ]}
          />

          <section className="arc-kit-controls-grid">
            <div className="grid gap-3">
              <h3 className="arc-kit-section-title">{t("templates.section.buttons")}</h3>
              <div className="grid gap-2">
                <h4 className="arc-kit-button-group-title">{t("templates.section.primaryButtons")}</h4>
                <div className="arc-kit-button-variant-grid">
                  <AppButton type="button" variant="primary" size="xs">
                    {t("templates.button.primarySmall")}
                  </AppButton>
                  <AppButton type="button" variant="primary" size="sm" icon={<Check size={14} aria-hidden="true" />}>
                    {t("templates.button.primaryIcon")}
                  </AppButton>
                  <AppButton type="button" variant="primary" size="md">
                    {t("templates.button.primary")}
                  </AppButton>
                  <AppButton type="button" variant="primary" size="lg" icon={<ChevronsRight size={16} aria-hidden="true" />}>
                    {t("templates.button.primaryLarge")}
                  </AppButton>
                  <AppButton type="button" variant="primary" className="arc-kit-button-wide" icon={<Check size={15} aria-hidden="true" />}>
                    {t("templates.button.primaryWide")}
                  </AppButton>
                  <AppButton type="button" variant="primary" disabled>
                    {t("templates.button.primaryDisabled")}
                  </AppButton>
                  <AppButton type="button" variant="primary" size="icon" aria-label={t("templates.button.primaryIconOnly")}>
                    <Plus size={15} aria-hidden="true" />
                  </AppButton>
                </div>
              </div>
              <div className="grid gap-2">
                <h4 className="arc-kit-button-group-title">{t("templates.section.secondaryButtons")}</h4>
                <div className="arc-kit-button-variant-grid">
                  <AppButton type="button" variant="secondary" size="xs">
                    {t("templates.button.secondarySmall")}
                  </AppButton>
                  <AppButton type="button" variant="secondary" size="sm" icon={<Gavel size={14} aria-hidden="true" />}>
                    {t("templates.button.secondaryIcon")}
                  </AppButton>
                  <AppButton type="button" variant="secondary" size="md">
                    {t("templates.button.secondary")}
                  </AppButton>
                  <AppButton type="button" variant="secondary" size="lg" icon={<ChevronsRight size={16} aria-hidden="true" />}>
                    {t("templates.button.secondaryLarge")}
                  </AppButton>
                  <AppButton type="button" variant="secondary" className="arc-kit-button-wide" icon={<ScrollText size={15} aria-hidden="true" />}>
                    {t("templates.button.secondaryWide")}
                  </AppButton>
                  <AppButton type="button" variant="secondary" disabled>
                    {t("templates.button.secondaryDisabled")}
                  </AppButton>
                  <AppButton type="button" variant="secondary" size="icon" aria-label={t("templates.button.secondaryIconOnly")}>
                    <Gavel size={15} aria-hidden="true" />
                  </AppButton>
                </div>
              </div>
              <div className="grid gap-2">
                <h4 className="arc-kit-button-group-title">{t("templates.section.dangerButtons")}</h4>
                <div className="arc-kit-button-variant-grid">
                  <AppButton type="button" variant="danger" size="xs" sound="button.danger">
                    {t("templates.button.dangerSmall")}
                  </AppButton>
                  <AppButton type="button" variant="danger" size="sm" icon={<Swords size={14} aria-hidden="true" />} sound="button.danger">
                    {t("templates.button.dangerIcon")}
                  </AppButton>
                  <AppButton type="button" variant="danger" size="md" sound="button.danger">
                    {t("templates.button.danger")}
                  </AppButton>
                  <AppButton type="button" variant="danger" size="lg" icon={<Shield size={16} aria-hidden="true" />} sound="button.danger">
                    {t("templates.button.dangerLarge")}
                  </AppButton>
                  <AppButton type="button" variant="danger" className="arc-kit-button-wide" icon={<Swords size={15} aria-hidden="true" />} sound="button.danger">
                    {t("templates.button.dangerWide")}
                  </AppButton>
                  <AppButton type="button" variant="danger" disabled sound="button.danger">
                    {t("templates.button.dangerDisabled")}
                  </AppButton>
                  <AppButton type="button" variant="danger" size="icon" aria-label={t("templates.button.dangerIconOnly")} sound="button.danger">
                    <Swords size={15} aria-hidden="true" />
                  </AppButton>
                </div>
              </div>
              <div className="grid gap-2">
                <AppButton type="button" variant="primary">{t("templates.button.primary")}</AppButton>
                <AppButton type="button" variant="secondary">{t("templates.button.secondary")}</AppButton>
                <AppButton type="button" variant="danger" sound="button.danger">{t("templates.button.danger")}</AppButton>
                <AppButton type="button" variant="ghost">{t("templates.button.ghost")}</AppButton>
              </div>
              <div className="flex flex-wrap gap-2">
                <AppButton type="button" size="icon" aria-label={t("templates.icon.add")}><Plus size={15} aria-hidden="true" /></AppButton>
                <AppButton type="button" size="icon" aria-label={t("templates.icon.edit")}><Gavel size={15} aria-hidden="true" /></AppButton>
                <GameTooltip content={t("templates.tooltip.simple")} placement="top">
                  <AppButton type="button" size="icon" aria-label={t("templates.icon.view")}><Landmark size={15} aria-hidden="true" /></AppButton>
                </GameTooltip>
              </div>
            </div>

            <div className="grid gap-3">
              <h3 className="arc-kit-section-title">{t("templates.section.switches")}</h3>
              <AppToggle checked={enabled} onChange={setEnabled} label={t("templates.toggle.on")} description={t("templates.toggle.description")} />
              <div className="flex items-center justify-between gap-3">
                <span className="arc-kit-asset-sample__hint">{t("templates.toggle.on")}</span>
                <GameSwitch checked={enabled} onChange={setEnabled} ariaLabel={t("templates.toggle.on")} />
              </div>
              <AppToggle checked={false} onChange={() => undefined} disabled label={t("templates.toggle.locked")} />
              <div className="flex flex-wrap gap-2">
                <AppStatusChip tone="active">{t("templates.status.active")}</AppStatusChip>
                <AppStatusChip tone="pending">{t("templates.status.pending")}</AppStatusChip>
                <AppStatusChip tone="available">{t("templates.status.available")}</AppStatusChip>
                <AppStatusChip tone="unavailable">{t("templates.status.unavailable")}</AppStatusChip>
                <AppStatusChip tone="locked">{t("templates.status.locked")}</AppStatusChip>
              </div>
            </div>

            <div className="grid gap-3 md:col-span-2">
              <h3 className="arc-kit-section-title">{t("templates.section.fields")}</h3>
              <GameFramePanel>
                <div className="arc-kit-asset-sample__title">{t("templates.section.panel")}</div>
                <div className="arc-kit-asset-sample__hint">{t("templates.panel.description")}</div>
              </GameFramePanel>
              <div className="grid gap-3 md:grid-cols-2">
                <GameTextField label={t("templates.field.name")} defaultValue={t("templates.sample.country")} />
                <GameTextField label={t("templates.field.culture")} placeholder={t("templates.placeholder.culture")} />
              </div>
              <GameDropdownField
                label={t("templates.field.dropdown")}
                value={dropdownValue}
                onChange={setDropdownValue}
                options={[
                  { value: "river", label: t("templates.dropdown.river") },
                  { value: "mountain", label: t("templates.dropdown.mountain") },
                  { value: "coastal", label: t("templates.dropdown.coastal") },
                ]}
              />
              <GameTextField multiline rows={2} label={t("templates.field.description")} placeholder={t("templates.placeholder.description")} />
              <GameColorPickerButton value={selectedColor} label={t("templates.colorPicker")} onChange={setSelectedColor} />
              <div className="arc-kit-preview-chip-sample">
                <div className="arc-kit-asset-sample__title">{t("templates.previewChipsTitle")}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <GamePreviewChip color={selectedColor} label={t("templates.previewChip.color")} />
                  <GamePreviewChip label={t("templates.previewChip.icon")}>
                    <Crown size={22} aria-hidden="true" />
                  </GamePreviewChip>
                  <GamePreviewChip emptyLabel={t("templates.previewChip.empty")} />
                  <GamePreviewChipGroup color={selectedColor} label={t("templates.previewChip.group")}>
                    <Flag size={22} aria-hidden="true" />
                  </GamePreviewChipGroup>
                </div>
              </div>
              <div className="arc-kit-asset-sample">
                <GameImageUploadCard
                  label={t("templates.asset.flagUpload")}
                  clearLabel={t("templates.asset.clear")}
                  file={uploadedFlag}
                  onFileChange={setUploadedFlag}
                  fallbackIcon={<Flag size={42} aria-hidden="true" />}
                />
                <div className="min-w-0">
                  <div className="arc-kit-asset-sample__title">{t("templates.asset.flagTitle")}</div>
                  <div className="arc-kit-asset-sample__hint">{t(uploadedFlag ? "templates.asset.flagReady" : "templates.asset.flagHint")}</div>
                </div>
              </div>
            </div>
          </section>

          <GameTechTreePreview
            title={t("templates.techTitle")}
            nodes={[
              { id: "civil-service", label: t("templates.tech.civilService"), meta: t("templates.turnCost", { turns: 6 }), icon: <Landmark size={18} aria-hidden="true" />, state: "selected" },
              { id: "bureaucracy", label: t("templates.tech.bureaucracy"), meta: t("templates.turnCost", { turns: 6 }), icon: <ScrollText size={18} aria-hidden="true" />, state: "available" },
              { id: "codes", label: t("templates.tech.codes"), meta: t("templates.turnCost", { turns: 8 }), icon: <Scale size={18} aria-hidden="true" />, state: "available" },
              { id: "education", label: t("templates.tech.education"), meta: t("templates.turnCost", { turns: 8 }), icon: <BookOpen size={18} aria-hidden="true" />, state: "available" },
              { id: "supply", label: t("templates.tech.supply"), meta: t("templates.turnCost", { turns: 8 }), icon: <Swords size={18} aria-hidden="true" />, state: "available" },
              { id: "planning", label: t("templates.tech.planning"), meta: t("templates.turnCost", { turns: 8 }), icon: <Landmark size={18} aria-hidden="true" />, state: "locked" },
            ]}
          />

          <section className="arc-kit-showcase">
            <div className="arc-kit-showcase__header">
              <h3 className="arc-kit-section-title">{t("templates.chartsTitle")}</h3>
              <BarChart3 size={16} aria-hidden="true" />
            </div>
            <div className="arc-kit-chart-grid">
              {chartPreviews.map((chart) => (
                <GameChartPreview
                  key={chart.id}
                  type={chart.type}
                  title={t(chart.titleKey)}
                  label={t(chart.titleKey)}
                  icon={chart.type === "donut" ? <PieChart size={14} aria-hidden="true" /> : <LineChart size={14} aria-hidden="true" />}
                />
              ))}
            </div>
          </section>

          <section className="arc-kit-showcase">
            <div className="arc-kit-showcase__header">
              <h3 className="arc-kit-section-title">{t("templates.scrollbarTitle")}</h3>
              <ScrollText size={16} aria-hidden="true" />
            </div>
            <GameScrollList
              ariaLabel={t("templates.scrollbarTitle")}
              items={Array.from({ length: 9 }, (_, index) => ({
                id: `scroll-row-${index + 1}`,
                label: t("templates.scrollbarRow", { index: index + 1 }),
                value: t("templates.turnCost", { turns: index + 2 }),
              }))}
            />
          </section>
        </section>

        <aside className="arc-kit-gallery__side">
          <GameDetailPanel
            title={t("templates.detail.title")}
            subtitle={t("templates.detail.subtitle")}
            description={t("templates.detail.description")}
            icon={<Landmark size={24} aria-hidden="true" />}
            favoriteLabel={t("templates.detail.favorite")}
            sections={[
              {
                title: t("templates.detail.effects"),
                rows: [
                  { label: t("templates.resource.science"), value: "+3", icon: <Beaker size={14} aria-hidden="true" /> },
                  { label: t("templates.resource.culture"), value: "+1", icon: <BookOpen size={14} aria-hidden="true" /> },
                  { label: t("templates.resource.influence"), value: "+1", icon: <Crown size={14} aria-hidden="true" /> },
                ],
              },
              {
                title: t("templates.detail.cost"),
                rows: [
                  { label: t("templates.resource.gold"), value: "180", icon: <Coins size={14} aria-hidden="true" /> },
                  { label: t("templates.detail.turns"), value: t("templates.turnCost", { turns: 6 }) },
                ],
              },
            ]}
            footer={t("templates.detail.pinHint")}
          />

          <GameResourcePanel
            title={t("templates.resourcesTitle")}
            resources={[
              { id: "gold", label: t("templates.resource.gold"), value: "2450", delta: "+120", icon: <Coins size={15} aria-hidden="true" /> },
              { id: "science", label: t("templates.resource.science"), value: "340", delta: "+28", icon: <Beaker size={15} aria-hidden="true" /> },
              { id: "culture", label: t("templates.resource.culture"), value: "560", delta: "+35", icon: <BookOpen size={15} aria-hidden="true" /> },
              { id: "influence", label: t("templates.resource.influence"), value: "120", delta: "+12", icon: <Crown size={15} aria-hidden="true" /> },
            ]}
          />

          <GameNotificationList
            title={t("templates.notificationsTitle")}
            showAllLabel={t("templates.showAll")}
            notifications={[
              { id: "research", label: t("templates.notification.research"), icon: <Beaker size={15} aria-hidden="true" />, dismissLabel: t("templates.dismissNotification") },
              { id: "build", label: t("templates.notification.build"), icon: <Gavel size={15} aria-hidden="true" />, dismissLabel: t("templates.dismissNotification") },
              { id: "envoy", label: t("templates.notification.envoy"), icon: <ScrollText size={15} aria-hidden="true" />, dismissLabel: t("templates.dismissNotification") },
            ]}
            onDismiss={() => undefined}
          />

          <GameTooltipCard
            eyebrow={t("templates.tooltip.eyebrow")}
            title={t("templates.tooltip.title")}
            description={t("templates.tooltip.description")}
            icon={<Landmark size={18} aria-hidden="true" />}
            rows={[
              { label: t("templates.tooltip.requirement"), value: t("templates.tech.civilService") },
              { label: t("templates.tooltip.maintenance"), value: t("templates.detail.goldPerTurn", { value: 3 }) },
            ]}
            pinHint={t("templates.detail.pinHint")}
          />

          {plotTooltipSamples.map((sample, index) => (
            <GamePlotTooltipCard
              key={index}
              data={sample}
              density={index === 2 ? "compact" : "detailed"}
              pinned={index === 1}
            />
          ))}
        </aside>
      </main>
    </div>
  );
}

function isColorInputValue(value: string): boolean {
  return /^#[\da-f]{6}$/i.test(value);
}
