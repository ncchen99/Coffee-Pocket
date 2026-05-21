import { useState } from "react";
import {
  useIsCafeInPocket,
  usePockets,
  useAddToPocket,
  useRemoveFromPocket,
  useCreatePocket,
  useSubmitReport,
} from "@/hooks/usePockets";
import { useAuth } from "@/hooks/useAuth";

/**
 * 集中管理「加入口袋 / 建立口袋 / 回報問題」的狀態與 handler,
 * 讓 CafeDetailContent 與外層 Header(手機)能共用同一份 state。
 */
export function useCafeActions(cafeId: string | null) {
  const { user } = useAuth();
  const enabled = user && cafeId ? cafeId : null;

  const { data: inPocket } = useIsCafeInPocket(enabled);
  const { data: pockets } = usePockets();
  const addMutation = useAddToPocket();
  const removeMutation = useRemoveFromPocket();
  const createPocketMutation = useCreatePocket();
  const reportMutation = useSubmitReport();

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isCreatePocketOpen, setIsCreatePocketOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [pendingAddAfterCreate, setPendingAddAfterCreate] = useState(false);

  const handlePocketClick = () => {
    if (!user || !cafeId) return;
    if (inPocket) {
      removeMutation.mutate({ pocketId: inPocket.pocketId, cafeId });
      return;
    }
    if (!pockets || pockets.length === 0) {
      setPendingAddAfterCreate(true);
      setIsCreatePocketOpen(true);
    } else {
      setIsPickerOpen(true);
    }
  };

  const handlePickPocket = (pocketId: string) => {
    if (!cafeId) return;
    addMutation.mutate({ pocketId, cafeId });
  };

  const handleCreatePocket = (name: string) => {
    createPocketMutation.mutate(
      { name },
      {
        onSuccess: (newPocket) => {
          if (pendingAddAfterCreate && cafeId) {
            addMutation.mutate({ pocketId: newPocket.id, cafeId });
            setPendingAddAfterCreate(false);
          }
        },
      },
    );
  };

  const handleReport = (input: { type: "closed" | "duplicate" | "wrong" | "other"; note: string }) => {
    if (!user || !cafeId) return;
    reportMutation.mutate(
      { cafe_id: cafeId, type: input.type, note: input.note || undefined },
      {
        onSuccess: () => setIsReportOpen(false),
      },
    );
  };

  const pocketLabel = inPocket ? `已在「${inPocket.pocketName}」` : "加入口袋";
  const pocketDisabled = !user || addMutation.isPending || removeMutation.isPending;

  return {
    user,
    inPocket,
    pockets,
    pocketLabel,
    pocketDisabled,
    handlePocketClick,
    handlePickPocket,
    handleCreatePocket,
    handleReport,
    openReport: () => setIsReportOpen(true),
    reportSubmitting: reportMutation.isPending,
    modalState: {
      isPickerOpen,
      isCreatePocketOpen,
      isReportOpen,
      closePicker: () => setIsPickerOpen(false),
      closeCreatePocket: () => {
        setIsCreatePocketOpen(false);
        setPendingAddAfterCreate(false);
      },
      closeReport: () => setIsReportOpen(false),
      openCreateFromPicker: () => {
        setPendingAddAfterCreate(true);
        setIsCreatePocketOpen(true);
      },
    },
  };
}

export type CafeActions = ReturnType<typeof useCafeActions>;
