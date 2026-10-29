import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { useSEO } from "@/hooks/useSEO";

const NotFound = () => {
  useSEO({ title: "Page not found", description: "The page you were looking for doesn't exist.", noIndex: true });

  return (
    <Layout>
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold">404</h1>
          <p className="mb-6 text-xl text-muted-foreground">We couldn't find that page.</p>
          <Link to="/" className="text-primary underline hover:text-primary/90">
            Return to Home
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;
