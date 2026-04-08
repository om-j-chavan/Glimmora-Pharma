import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";

const commitSchema = z.object({
  text: z.string().min(5, "Commitment text required"),
  dueDate: z.string().min(1, "Due date required"),
  owner: z.string().min(1, "Owner required"),
  status: z.enum(["Pending", "In Progress", "Complete", "Overdue"]),
});

export type CommitFormData = z.infer<typeof commitSchema>;

interface User {
  id: string;
  name: string;
  status: string;
}

export interface AddCommitmentModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: CommitFormData) => void;
  users: User[];
}

export function AddCommitmentModal({ open, onClose, onSave, users }: AddCommitmentModalProps) {
  const form = useForm<CommitFormData>({
    resolver: zodResolver(commitSchema),
    defaultValues: { status: "Pending" },
  });

  function handleSubmit(data: CommitFormData) {
    onSave(data);
    form.reset();
  }

  function handleClose() {
    onClose();
    form.reset();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add commitment"
    >
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        noValidate
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label
              htmlFor="cm-text"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Commitment *
            </label>
            <textarea
              id="cm-text"
              rows={2}
              className="input text-[12px] resize-none"
              placeholder="e.g. Submit validation protocol by 15 Apr 2026"
              {...form.register("text")}
            />
            {form.formState.errors.text && (
              <p role="alert" className="text-[11px] text-[#ef4444] mt-1">
                {form.formState.errors.text.message}
              </p>
            )}
          </div>
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Owner *
            </label>
            <Controller
              name="owner"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select owner"
                  width="w-full"
                  options={users
                    .filter((u) => u.status === "Active")
                    .map((u) => ({ value: u.id, label: u.name }))}
                />
              )}
            />
          </div>
          <div>
            <label
              htmlFor="cm-due"
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Due date *
            </label>
            <input
              id="cm-due"
              type="date"
              className="input text-[12px]"
              {...form.register("dueDate")}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider block mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Status
            </label>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Dropdown
                  value={field.value}
                  onChange={field.onChange}
                  width="w-full"
                  options={[
                    "Pending",
                    "In Progress",
                    "Complete",
                    "Overdue",
                  ].map((s) => ({ value: s, label: s }))}
                />
              )}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            type="button"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={form.formState.isSubmitting}
          >
            Add commitment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
