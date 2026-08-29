import { fetchAllArticles } from "@/lib/feeds";
import NewsApp from "@/components/NewsApp";

export const revalidate = 900;

export default async function Home() {
  const articles = await fetchAllArticles();
  return <NewsApp initialArticles={articles} />;
}
