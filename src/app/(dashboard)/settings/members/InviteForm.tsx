"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/auth/FormField";
import { inviteCreateSchema, type InviteCreateInput } from "@/lib/schemas/org";

export function InviteForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteCreateInput>({
    resolver: zodResolver(inviteCreateSchema),
    defaultValues: { role: "member" },
  });
  const role = watch("role");

  async function onSubmit(values: InviteCreateInput) {
    const res = await fetch("/api/org/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (json.error) {
      if (json.error.code === "email_failed") {
        toast.warning(json.error.message);
        reset();
        router.refresh();
        return;
      }
      toast.error(json.error.message);
      return;
    }
    toast.success(`Invite sent to ${values.email}`);
    reset();
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <FormField label="Email" htmlFor="invite-email" error={errors.email?.message}>
          <Input
            id="invite-email"
            type="email"
            placeholder="teammate@company.com"
            {...register("email")}
          />
        </FormField>
      </div>
      <div className="w-full sm:w-40">
        <FormField label="Role" htmlFor="invite-role" error={errors.role?.message}>
          <Select value={role} onValueChange={(v) => setValue("role", v as "admin" | "member")}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending..." : "Send invite"}
      </Button>
    </form>
  );
}
