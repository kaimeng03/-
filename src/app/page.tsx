import { fetchAllArticles } from "@/lib/feeds";
import { getSourcesConfig } from "@/lib/sourceStore";
import NewsApp from "@/components/NewsApp";

export const revalidate = 900;

export default async function Home() {
  const { categories, sources } = await getSourcesConfig();
  const articles = await fetchAllArticles(sources);
  return <NewsApp initialArticles={articles} categories={categories} sources={sources} />;
}
