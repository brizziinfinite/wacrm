import { z } from "zod";

export const brandSchema = z.object({
  name: z.string().min(2, "O nome da marca deve ter pelo menos 2 caracteres"),
  slug: z
    .string()
    .min(2, "O slug deve ter pelo menos 2 caracteres")
    .regex(/^[a-z0-9-]+$/, "Slug deve conter apenas letras minúsculas, números e hífens"),
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida")
    .optional(),
});

export type BrandFormData = z.infer<typeof brandSchema>;
