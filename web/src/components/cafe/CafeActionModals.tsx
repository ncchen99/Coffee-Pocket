import { InputModal, PocketPickerModal, ReportModal } from "@/components/primitives";
import type { CafeActions } from "@/hooks/useCafeActions";

/** 共用 Modal 群組 — 由 useCafeActions 提供的 state 驅動。 */
export function CafeActionModals({ actions }: { actions: CafeActions }) {
  const { modalState, pockets, handlePickPocket, handleCreatePocket, handleReport, reportSubmitting } = actions;

  return (
    <>
      <PocketPickerModal
        isOpen={modalState.isPickerOpen}
        onClose={modalState.closePicker}
        pockets={pockets ?? []}
        onPick={handlePickPocket}
        onCreate={modalState.openCreateFromPicker}
      />

      <InputModal
        isOpen={modalState.isCreatePocketOpen}
        onClose={modalState.closeCreatePocket}
        onSubmit={handleCreatePocket}
        title="建立新口袋"
        description="幫這個口袋取個好記的名字，例如「想去的咖啡店」。"
        placeholder="口袋名稱"
        submitText="建立"
      />

      <ReportModal
        isOpen={modalState.isReportOpen}
        onClose={modalState.closeReport}
        onSubmit={handleReport}
        isSubmitting={reportSubmitting}
      />
    </>
  );
}
