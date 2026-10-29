import { motion } from "framer-motion";
import deptPlatform from "@/assets/dept-platform.png";
import { safeHref } from "@/lib/sanitize";

/** Each tech item: name shown, SVG logo URL (Simple Icons CDN = https://cdn.simpleicons.org/<slug>/<hex>), official link */
const techCategories = [
  {
    category: "Agentic AI & Automation",
    items: [
      { name: "LangChain", logo: "https://cdn.simpleicons.org/langchain/1C3C3C", url: "https://www.langchain.com" },
      { name: "OpenAI", logo: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/openai.svg", url: "https://openai.com" },
      { name: "Anthropic", logo: "https://cdn.simpleicons.org/anthropic/191919", url: "https://www.anthropic.com" },
      { name: "n8n", logo: "https://cdn.simpleicons.org/n8n/EA4B71", url: "https://n8n.io" },
      { name: "Zapier", logo: "https://cdn.simpleicons.org/zapier/FF4A00", url: "https://zapier.com" },
      { name: "Make", logo: "https://cdn.simpleicons.org/make/6D00CC", url: "https://www.make.com" },
    ],
  },
  {
    category: "AI & Machine Learning",
    items: [
      { name: "PyTorch", logo: "https://cdn.simpleicons.org/pytorch/EE4C2C", url: "https://pytorch.org" },
      { name: "TensorFlow", logo: "https://cdn.simpleicons.org/tensorflow/FF6F00", url: "https://www.tensorflow.org" },
      { name: "Hugging Face", logo: "https://cdn.simpleicons.org/huggingface/FFD21E", url: "https://huggingface.co" },
      { name: "scikit-learn", logo: "https://cdn.simpleicons.org/scikitlearn/F7931E", url: "https://scikit-learn.org" },
      { name: "Vertex AI", logo: "https://cdn.simpleicons.org/googlecloud/4285F4", url: "https://cloud.google.com/vertex-ai" },
      { name: "MLflow", logo: "https://cdn.simpleicons.org/mlflow/0194E2", url: "https://mlflow.org" },
    ],
  },
  {
    category: "Computer Vision",
    items: [
      { name: "OpenCV", logo: "https://cdn.simpleicons.org/opencv/5C3EE8", url: "https://opencv.org" },
      { name: "Roboflow", logo: "https://cdn.simpleicons.org/roboflow/6706CE", url: "https://roboflow.com" },
      { name: "NVIDIA", logo: "https://cdn.simpleicons.org/nvidia/76B900", url: "https://developer.nvidia.com" },
      { name: "MediaPipe", logo: "https://cdn.simpleicons.org/google/4285F4", url: "https://mediapipe.dev" },
      { name: "TensorRT", logo: "https://cdn.simpleicons.org/nvidia/76B900", url: "https://developer.nvidia.com/tensorrt" },
      { name: "ONNX", logo: "https://cdn.simpleicons.org/onnx/005CED", url: "https://onnx.ai" },
    ],
  },
  {
    category: "SaaS & Platform",
    items: [
      { name: "Next.js", logo: "https://cdn.simpleicons.org/nextdotjs/000000", url: "https://nextjs.org" },
      { name: "React", logo: "https://cdn.simpleicons.org/react/61DAFB", url: "https://react.dev" },
      { name: "Node.js", logo: "https://cdn.simpleicons.org/nodedotjs/339933", url: "https://nodejs.org" },
      { name: "TypeScript", logo: "https://cdn.simpleicons.org/typescript/3178C6", url: "https://www.typescriptlang.org" },
      { name: "Stripe", logo: "https://cdn.simpleicons.org/stripe/635BFF", url: "https://stripe.com" },
      { name: "Vercel", logo: "https://cdn.simpleicons.org/vercel/000000", url: "https://vercel.com" },
    ],
  },
  {
    category: "Data & Infrastructure",
    items: [
      { name: "MongoDB", logo: "https://cdn.simpleicons.org/mongodb/47A248", url: "https://www.mongodb.com" },
      { name: "PostgreSQL", logo: "https://cdn.simpleicons.org/postgresql/4169E1", url: "https://www.postgresql.org" },
      { name: "Redis", logo: "https://cdn.simpleicons.org/redis/FF4438", url: "https://redis.io" },
      { name: "AWS", logo: "https://cdn.simpleicons.org/amazonwebservices/FF9900", url: "https://aws.amazon.com" },
      { name: "Docker", logo: "https://cdn.simpleicons.org/docker/2496ED", url: "https://www.docker.com" },
      { name: "Kubernetes", logo: "https://cdn.simpleicons.org/kubernetes/326CE5", url: "https://kubernetes.io" },
      { name: "Cloudinary", logo: "https://cdn.simpleicons.org/cloudinary/3448C5", url: "https://cloudinary.com" },
    ],
  },
];

const TechStackSection = () => {
  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block text-xs font-mono text-secondary uppercase tracking-widest mb-4">Technology</span>
            <h2 className="text-3xl lg:text-5xl font-display font-extrabold mb-4">
              The Stack Behind <span className="gradient-text">Our Work</span>
            </h2>
            <p className="text-muted-foreground mb-10">Cutting-edge tools chosen for each domain to deliver production-grade AI systems.</p>

            <div className="space-y-6">
              {techCategories.map((cat, ci) => (
                <motion.div
                  key={cat.category}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: ci * 0.1 }}
                >
                  <p className="text-xs font-mono text-primary mb-2 uppercase tracking-wider">{cat.category}</p>
                  <div className="flex flex-wrap gap-2">
                    {cat.items.map((tech) => (
                      <motion.a
                        key={tech.name}
                        href={safeHref(tech.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        whileHover={{ scale: 1.05, y: -2 }}
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 glow-hover transition-all cursor-pointer group"
                      >
                        <img
                          src={tech.logo}
                          alt={tech.name}
                          className="h-4 w-4 object-contain"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        {tech.name}
                      </motion.a>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="relative rounded-2xl border border-border overflow-hidden">
              <img src={deptPlatform} alt="SunTriX Cloud Platform" className="w-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
            </div>
            <motion.div
              className="absolute -bottom-4 -left-4 rounded-xl border border-primary/30 bg-card p-4 shadow-xl"
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
            >
              <p className="text-2xl font-extrabold gradient-text">60+</p>
              <p className="text-[10px] text-muted-foreground">Tools Mastered</p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default TechStackSection;
