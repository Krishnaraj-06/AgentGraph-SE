import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ workspace: string }>;
}

export default async function WorkspaceRootPage({ params }: Props) {
  const { workspace } = await params;
  redirect(`/${workspace}/overview`);
}
